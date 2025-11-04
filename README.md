# 🐝 "Bright Bee" Chromebook Reservation System

This is a Chromebook scheduling system built with Google Apps Script and Google Sheets. It allows teachers and staff to quickly reserve equipment via a web form, preventing real-time scheduling conflicts and sending automatic email reminders.

## 📸 Screenshots

![Screenshot of the Bright Bee reservation form](https://cdn.discordapp.com/attachments/460193765404049415/1435382754006011924/3B5044EB-6A4D-474A-ABA8-5A2CAA91249E.png?ex=690bc3dc&is=690a725c&hm=105b0d0656a4de591f3c5bf0c558927c7ee71ac713f1ba8db8bb8d385e467a06&)

---

## ✨ Key Features

The system is designed to be both simple for the end-user and robust behind the scenes.

* **Modern Web Form:** A responsive interface (HTML/CSS/JS) for easy completion on any device.
* **Real-Time Conflict Checking:** The form queries the spreadsheet and **visually disables (grays out/strikes through)** time slots that are already reserved for the selected date, *before* the user clicks "Reserve."
* **Automatic Monthly Organization:** The back-end automatically creates a new tab in the Google Sheet for each month (e.g., "November 2025," "December 2025"), keeping the reservation history clean and performance fast.
* **Email Reminders:** A daily trigger checks for the next day's reservations and automatically sends a reminder email to the teacher who made the booking.
* **Automatic User Identification:** The system automatically captures the email of the user logged into their Google account (`Session.getActiveUser()`), with no manual typing or login required.
* **Concurrency-Safe:** Utilizes Apps Script's `LockService` on the back-end to ensure two users cannot reserve the exact same time slot simultaneously (preventing "race conditions").
* **Performance Optimization:** Uses a hidden "Index" tab (`_Indice`) so the daily reminder check is instantaneous, reading only active month-tabs instead of every tab ever created.

---

## 🛠️ Technologies Used

* **Front-end:** HTML5, CSS3, JavaScript
* **Back-end:** Google Apps Script (`Code.gs`)
* **Database:** Google Sheets
* **Google Services:**
    * `SpreadsheetApp`: To read from and write to the spreadsheet.
    * `MailApp`: To send reminder emails.
    * `Session`: To identify the user's email.
    * `LockService`: To ensure data integrity.
    * `Triggers`: To automate reminder and cleanup routines.

---

## ⚙️ Architecture and How It Works

The system operates in three main parts:

### 1. The Form (Front-end)

1. A user accesses the `/exec` deployment URL of the Web App.
2. The `doGet()` function in `Code.gs` serves the `index.html` file.
3. When the user selects a date (`onchange`), the JavaScript calls `google.script.run.getReservasPorData(data)`.
4. The back-end queries that month's spreadsheet and returns a list of already booked time slots.
5. The JavaScript receives this list and updates the UI, disabling the corresponding checkboxes.

### 2. The Reservation Submission (Back-end)

1. The user clicks "Confirm Reservation."
2. The JavaScript sends the form data to `google.script.run.processarReserva(formData)`.
3. The `processarReserva()` function executes:
    a. Captures the user's email (`Session.getActiveUser().getEmail()`).
    b. Acquires a `LockService` to block concurrent access.
    c. Formats the date from "YYYY-MM-DD" to "DD-MM-YYYY".
    d. Calls `getPlanilhaDoMes()` to find or create the month's tab (e.g., "November 2025").
    e. **Optimization:** If the tab is new, `getPlanilhaDoMes()` also registers it in the `_Indice` tab.
    f. Performs a final conflict check on the server.
    g. Saves the data to the spreadsheet (including the email) and returns a success message.

### 3. Automated Routines (Triggers)

The system has two time-based triggers that run on the server:

1. **`verificarLembretes()` (Daily Trigger):**
    * Runs every day (e.g., 8-9 AM).
    * Reads the `_Indice` tab to get the list of *active* month-tabs.
    * Checks (only in those tabs) which reservations are for "tomorrow."
    * Sends a reminder email to the teacher's email address registered with the reservation.
2. **`limparIndiceAntigo()` (Monthly Trigger):**
    * Runs on the 1st of every month.
    * Checks the `_Indice` tab and removes entries for months that have already passed.
    * This ensures the `verificarLembretes()` function remains fast, even after years of use.

---

## 🚀 Installation and Deployment

To deploy this project in your own Google account:

1. Create a new project at [Google Apps Script](https://script.google.com).
2. In the editor, create two files:
    * `Code.gs` (script file)
    * `index.html` (HTML file)
3. Copy and paste the contents of the respective project files into them.
4. **Deploy the Application:**
    * In the top-right corner, click **Deploy > New deployment**.
    * Click the gear icon (next to "Select type") and choose **"Web app"**.
    * Fill out the configuration:
        * **Description:** (Optional, e.g., "Version 1.0")
        * **Execute as:** `User accessing the app` (This is **CRITICAL** for email capture to work).
        * **Who has access:** `Anyone with a Google account` (Recommended for schools).
    * Click **Deploy**.
5. **Authorize Permissions:** On the first deployment, Google will ask you to authorize the script to access your Spreadsheets, send emails on your behalf, and see your email. You must authorize this.
6. **Copy the Web App URL** (the one ending in `/exec`) and share it with your users.

### Trigger Setup

After the first deployment, set up the automated routines:

1. In the left sidebar of the editor, click **Triggers** (clock icon).
2. Click **+ Add Trigger** and create the following two:

    **Trigger 1: Daily Reminders**
    * **Function to run:** `verificarLembretes`
    * **Deployment to run:** `Head` (or `Principal`)
    * **Event source:** `Time-driven`
    * **Trigger type:** `Day timer`
    * **Time of day:** `8am to 9am` (or your preferred time)

    **Trigger 2: Monthly Index Cleanup**
    * **Function to run:** `limparIndiceAntigo`
    * **Deployment to run:** `Head` (or `Principal`)
    * **Event source:** `Time-driven`
    * **Trigger type:** `Month timer`
    * **Day of month:** `1st`
    * **Time of day:** `Midnight to 1am`

The system is now ready to use. The Google Sheet and the tabs (`_Indice`, "November 2025," etc.) will be created automatically the first time they are needed.
