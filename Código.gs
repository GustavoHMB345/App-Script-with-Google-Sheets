/**
 * Função principal que serve o HTML do formulário.
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle("Sistema de Reserva de Chromebooks");
}

/**
 * Função auxiliar para criar o nome da planilha.
 * Recebe "2025-11-10" e retorna "Novembro 2025".
 */
function formatarNomePlanilha(dataString) {
  const data = new Date(dataString + "T12:00:00"); 
  const mes = data.toLocaleString('pt-BR', { month: 'long' });
  const ano = data.getFullYear();
  const nomeMesFormatado = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${nomeMesFormatado} ${ano}`;
}

/**
 * Função auxiliar para formatar AAAA-MM-DD para DD-MM-AAAA
 */
function formatarData_AAAA_MM_DD_para_DD_MM_AAAA(dataString) {
  const [ano, mes, dia] = dataString.split('-');
  return `${dia}-${mes}-${ano}`;
}

// --- LÓGICA DO ÍNDICE ---

/**
 * NOVO: Cria ou obtém a planilha de índice "_Indice".
 * Esta planilha controla quais abas estão "ativas".
 */
function getIndiceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const NOME_ABA_INDICE = "_Indice";
  let sheet = ss.getSheetByName(NOME_ABA_INDICE);
  
  if (!sheet) {
    sheet = ss.insertSheet(NOME_ABA_INDICE);
    // Coluna A: Nome da aba (ex: "Novembro 2025")
    // Coluna B: Data de início do mês (ex: "2025-11-01") para facilitar a limpeza
    sheet.appendRow(["NomeAbaAtiva", "DataInicioMes"]);
    sheet.getRange("A1:B1").setFontWeight("bold");
    sheet.getRange("B:B").setNumberFormat("yyyy-mm-dd");
    sheet.hideSheet(); // Oculta a aba dos usuários
  }
  return sheet;
}

/**
 * ATUALIZADO: Encontra ou cria a planilha do mês.
 * AGORA TAMBÉM ADICIONA A ABA NO "_Indice" se ela for nova.
 */
function getPlanilhaDoMes(dataString) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomePlanilha = formatarNomePlanilha(dataString);
  let sheet = ss.getSheetByName(nomePlanilha);

  // Se a planilha do mês não existe, cria, formata E REGISTRA NO ÍNDICE
  if (!sheet) {
    sheet = ss.insertSheet(nomePlanilha);
    
    const headers = ["Data de reserva", "Horário", "Professor", "Email do Professor", "Turma/Disciplina", "Registro de sistema"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    
    const headerRange = sheet.getRange("A1:F1");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    
    const allDataRange = sheet.getRange("A:F");
    allDataRange.setHorizontalAlignment("center");
    allDataRange.setVerticalAlignment("middle");

    sheet.getRange("A:A").setNumberFormat("@"); 
    sheet.getRange("D:D").setNumberFormat("@");
    
    sheet.autoResizeColumns(1, headers.length);
    sheet.getRange(2, 1, sheet.getMaxRows(), headers.length).applyRowBanding();

    // --- NOVO: REGISTRA NO ÍNDICE ---
    try {
      const indiceSheet = getIndiceSheet();
      const dataInicioMes = dataString.split('-').slice(0, 2).join('-') + '-01'; // Ex: "2025-11-01"
      indiceSheet.appendRow([nomePlanilha, dataInicioMes]);
    } catch (e) {
      Logger.log(`Falha ao registrar "${nomePlanilha}" no _Indice: ${e.message}`);
      // Não é um erro crítico, o app principal continua
    }
    // --- FIM DA MUDANÇA ---
  }
  
  return sheet;
}

// --- LÓGICA DE PROCESSAMENTO E CONSULTA ---

/**
 * Processa a reserva (salva na planilha).
 * (Esta função não precisa de NENHUMA alteração, pois ela já chama getPlanilhaDoMes)
 */
function processarReserva(formData) {
  let userEmail;
  try {
     userEmail = Session.getActiveUser().getEmail();
  } catch (e) {
     return { success: false, message: "Erro: Não foi possível identificar seu e-mail. Verifique se você está logado em uma conta Google." };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    Logger.log('Não foi possível obter o bloqueio: ' + e);
    return { success: false, message: "Erro: O sistema está ocupado. Tente novamente em alguns segundos." };
  }

  try {
    const dataOriginal = formData.data;
    const dataSolicitada = formatarData_AAAA_MM_DD_para_DD_MM_AAAA(dataOriginal);
    
    // A função abaixo já garante que a aba seja criada E registrada no índice
    const sheet = getPlanilhaDoMes(dataOriginal); 
    
    const lastRow = sheet.getLastRow();
    let reservasExistentes = new Set(); 

    if (lastRow > 1) {
      const range = sheet.getRange(2, 1, lastRow - 1, 2); 
      const data = range.getDisplayValues();
      reservasExistentes = new Set(data.map(row => `${row[0]}|${row[1]}`));
    }
    
    const horariosSolicitados = formData.horarios;
    const conflitos = [];

    for (const horario of horariosSolicitados) {
      const chaveReserva = `${dataSolicitada}|${horario}`;
      if (reservasExistentes.has(chaveReserva)) {
        conflitos.push(`- O horário [${horario}] na data [${dataSolicitada}] já está reservado.`);
      }
    }

    if (conflitos.length > 0) {
      return {
        success: false,
        message: "Erro: Não foi possível realizar a reserva.\n" +
                 "Os seguintes horários já estão ocupados:\n" +
                 conflitos.join("\n")
      };
    }

    const timestamp = new Date();
    const linhasParaAdicionar = [];

    for (const horario of horariosSolicitados) {
      linhasParaAdicionar.push([
        dataSolicitada,
        horario,
        formData.professor,
        userEmail,
        formData.turma,
        timestamp
      ]);
    }
    
    sheet.getRange(sheet.getLastRow() + 1, 1, linhasParaAdicionar.length, 6)
         .setValues(linhasParaAdicionar);

    return {
      success: true,
      message: `Reserva efetuada com sucesso para ${horariosSolicitados.length} horário(s)!`
    };

  } catch (e) {
    Logger.log(e);
    return { success: false, message: "Ocorreu um erro inesperado no servidor: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Busca os horários já reservados para uma data específica.
 * (Esta função não precisa de NENHUMA alteração)
 */
function getReservasPorData(dataAAAA_MM_DD) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nomePlanilha = formatarNomePlanilha(dataAAAA_MM_DD);
    const sheet = ss.getSheetByName(nomePlanilha);
    
    if (!sheet) {
      return []; 
    }
    
    const dataFormatada = formatarData_AAAA_MM_DD_para_DD_MM_AAAA(dataAAAA_MM_DD);
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return []; 
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 2); 
    const data = range.getDisplayValues();
    
    const horariosReservados = data
      .filter(row => row[0] === dataFormatada) 
      .map(row => row[1]); 
      
    return horariosReservados;
    
  } catch (e) {
    Logger.log("Erro em getReservasPorData: " + e.message);
    return []; 
  }
}


// --- LÓGICA DE LEMBRETES E LIMPEZA ---

/**
 * ATUALIZADO: Esta função agora lê o "_Indice" em vez de todas as abas.
 * É muito mais rápida e eficiente.
 */
function verificarLembretes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Calcula a data de "Amanhã" (formato DD-MM-AAAA)
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const dia = amanha.getDate().toString().padStart(2, '0');
  const mes = (amanha.getMonth() + 1).toString().padStart(2, '0');
  const ano = amanha.getFullYear();
  const dataAmanhaFormatada = `${dia}-${mes}-${ano}`;
  
  Logger.log(`Procurando reservas para amanhã: ${dataAmanhaFormatada}`);

  // --- MUDANÇA: Ler do ÍNDICE ---
  const indiceSheet = getIndiceSheet();
  const lastRowIndice = indiceSheet.getLastRow();
  if (lastRowIndice <= 1) {
    Logger.log("Nenhuma aba ativa no _Indice. Encerrando lembretes.");
    return; // Nada para verificar
  }

  // Pega apenas a Coluna A (NomeAbaAtiva)
  const nomesDasAbas = indiceSheet.getRange(2, 1, lastRowIndice - 1, 1).getValues();
  Logger.log(`Abas ativas encontradas no _Indice: ${nomesDasAbas.join(", ")}`);

  // 3. Loop APENAS nas abas ativas listadas no _Indice
  for (const [nomeAba] of nomesDasAbas) {
    const aba = ss.getSheetByName(nomeAba);
    
    if (!aba) {
      Logger.log(`Aba "${nomeAba}" listada no índice não foi encontrada. Pulando.`);
      continue; 
    }
    
    // 4. Se a aba existe, lê os dados (lógica antiga)
    const lastRow = aba.getLastRow();
    if (lastRow <= 1) {
      continue; // Ignora se só tiver cabeçalho
    }
    
    const range = aba.getRange(2, 1, lastRow - 1, 4); // A=Data, B=Horário, C=Professor, D=Email
    const dados = range.getValues();
    
    for (const linha of dados) {
      const dataReserva = linha[0]; // Coluna A
      
      if (dataReserva === dataAmanhaFormatada) {
        // Encontramos uma reserva para amanhã!
        const horario = linha[1]; 
        const professor = linha[2];
        const emailProfessor = linha[3];
        
        try {
          const assunto = "Lembrete de Reserva de Chromebooks Bright Bee";
          const corpo = `
            Olá, Prof. ${professor}.
            <br><br>
            Este é um lembrete automático da sua reserva de Chromebooks para <b>amanhã, ${dataReserva}</b>.
            <br><br>
            <b>Horário(s):</b> ${horario}
            <br><br>
            Caso não precise mais da reserva, por favor, avise a coordenação.
            <br><br>
            Atenciosamente,
            <br>
            Sistema de Reservas Bright Bee
          `;
          
          MailApp.sendEmail({
            to: emailProfessor,
            subject: assunto,
            htmlBody: corpo 
          });
          
          Logger.log(`E-mail de lembrete enviado para ${emailProfessor}`);
          
        } catch (e) {
          Logger.log(`Falha ao enviar e-mail para ${emailProfessor}: ${e.message}`);
        }
      }
    }
  }
}

/**
 * NOVO: Função de limpeza. Remove meses passados do _Indice.
 * Deve ser executada por um acionador mensal.
 */
function limparIndiceAntigo() {
  const indiceSheet = getIndiceSheet();
  const lastRow = indiceSheet.getLastRow();
  if (lastRow <= 1) {
    return; // Nada para limpar
  }

  // Pega o primeiro dia do mês ATUAL
  const hoje = new Date();
  const primeiroDiaDoMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  
  // Lê todos os dados do índice
  const dadosIndice = indiceSheet.getRange(2, 1, lastRow - 1, 2).getValues(); // [[Nome, Data], [Nome, Data], ...]
  
  const abasParaManter = [];
  
  for (const [nomeAba, dataInicioMes] of dadosIndice) {
    const dataAba = new Date(dataInicioMes); // Converte "2025-11-01" para objeto Date
    
    // Se a data da aba for IGUAL OU MAIOR que o início do mês atual, ela deve ser mantida
    if (dataAba >= primeiroDiaDoMesAtual) {
      abasParaManter.push([nomeAba, dataInicioMes]);
    } else {
      Logger.log(`Limpando aba antiga do índice: ${nomeAba}`);
    }
  }
  
  // Limpa o índice antigo (exceto o cabeçalho)
  indiceSheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  
  // Se houver abas para manter, escreve-as de volta
  if (abasParaManter.length > 0) {
    indiceSheet.getRange(2, 1, abasParaManter.length, 2).setValues(abasParaManter);
  }
}
