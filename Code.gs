/**
 * LEDGER — Apps Script backend
 * -----------------------------------------------------------------
 * Deploy this as a Web App (Deploy > New deployment > Web app,
 * Execute as: Me, Who has access: Anyone). Copy the /exec URL into
 * the app's "Connect" screen.
 *
 * Expects a spreadsheet with three tabs (create them with these exact
 * names and header rows — see HOW_TO_INSTALL.md for the full setup):
 *
 * Users        | Username | Password | Role  | DisplayName |
 * Expenses     | ID | Username | Date | Category | Description | Amount | CreatedAt |
 * Categories   | Name |
 * -----------------------------------------------------------------
 */

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Bad request' });
  }

  const action = body.action;
  try {
    switch (action) {
      case 'login': return jsonOut(handleLogin(body));
      case 'getExpenses': return jsonOut(withAuth(body, handleGetExpenses));
      case 'addExpense': return jsonOut(withAuth(body, handleAddExpense));
      case 'deleteExpense': return jsonOut(withAuth(body, handleDeleteExpense));
      case 'getCategories': return jsonOut(withAuth(body, handleGetCategories));
      case 'addCategory': return jsonOut(withAuth(body, handleAddCategory));
      case 'removeCategory': return jsonOut(withAuth(body, handleRemoveCategory));
      case 'getUsers': return jsonOut(withAuth(body, handleGetUsers, true));
      case 'updateUser': return jsonOut(withAuth(body, handleUpdateUser, true));
      default: return jsonOut({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Auth ===================== */

function getUsersSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users'); }
function getExpensesSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Expenses'); }
function getCategoriesSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Categories'); }

function findUser(username) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      return { row: i + 1, username: data[i][0], password: data[i][1], role: data[i][2], displayName: data[i][3] };
    }
  }
  return null;
}

function handleLogin(body) {
  const user = findUser(body.username || '');
  if (!user || String(user.password) !== String(body.password)) {
    return { ok: false, error: 'Wrong username or password' };
  }
  return { ok: true, username: user.username, role: user.role, displayName: user.displayName };
}

// Re-checks username+password on every request. Admin-only actions also
// require role === 'admin'.
function withAuth(body, handler, requireAdmin) {
  const user = findUser(body.username || '');
  if (!user || String(user.password) !== String(body.password)) {
    return { ok: false, error: 'Session expired, please log in again' };
  }
  if (requireAdmin && user.role !== 'admin') {
    return { ok: false, error: 'Admin access required' };
  }
  return handler(body, user);
}

/* ===================== Expenses ===================== */

function handleGetExpenses(body, user) {
  const sheet = getExpensesSheet();
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    if (user.role !== 'admin' && String(r[1]).toLowerCase() !== String(user.username).toLowerCase()) continue;
    rows.push({
      id: r[0], username: r[1],
      date: formatDate(r[2]), category: r[3], description: r[4],
      amount: Number(r[5]), createdAt: r[6]
    });
  }
  return { ok: true, expenses: rows };
}

function formatDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

function handleAddExpense(body, user) {
  const sheet = getExpensesSheet();
  const id = 'e' + new Date().getTime() + Math.floor(Math.random() * 1000);
  const row = [id, user.username, body.date, body.category, body.description || '', Number(body.amount), new Date()];
  sheet.appendRow(row);
  return { ok: true, entry: { id, username: user.username, date: body.date, category: body.category, description: body.description || '', amount: Number(body.amount) } };
}

function handleDeleteExpense(body, user) {
  const sheet = getExpensesSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.id) {
      if (user.role !== 'admin' && String(data[i][1]).toLowerCase() !== String(user.username).toLowerCase()) {
        return { ok: false, error: 'Not your entry' };
      }
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Entry not found' };
}

/* ===================== Categories (shared) ===================== */

function handleGetCategories() {
  const sheet = getCategoriesSheet();
  const data = sheet.getDataRange().getValues();
  const cats = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) cats.push(data[i][0]);
  }
  return { ok: true, categories: cats };
}

function handleAddCategory(body) {
  const sheet = getCategoriesSheet();
  const existing = handleGetCategories().categories;
  if (existing.some(c => c.toLowerCase() === String(body.name).toLowerCase())) {
    return { ok: false, error: 'Already exists' };
  }
  sheet.appendRow([body.name]);
  return { ok: true };
}

function handleRemoveCategory(body) {
  const sheet = getCategoriesSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(body.name).toLowerCase()) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Not found' };
}

/* ===================== Admin: user management ===================== */

function handleGetUsers() {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    users.push({ username: data[i][0], role: data[i][2], displayName: data[i][3] });
  }
  return { ok: true, users: users };
}

function handleUpdateUser(body) {
  const target = findUser(body.targetUsername);
  if (!target) return { ok: false, error: 'User not found' };
  const sheet = getUsersSheet();
  if (body.newDisplayName) sheet.getRange(target.row, 4).setValue(body.newDisplayName);
  if (body.newPassword) sheet.getRange(target.row, 2).setValue(body.newPassword);
  return { ok: true };
}
