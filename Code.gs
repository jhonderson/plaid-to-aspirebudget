// Configurable values

const PLAID_CLIENT_ID = `XXXxxx`;
const PLAID_SANDBOX_SECRET = `XXXxxx`;
const PLAID_DEVELOPMENT_SECRET = `XXXxxx`;

// Mapping between account ids and Plaid access token
const ACCOUNT_ID_TO_ACCESS_TOKEN_MAPPING = {
  'accountId1_XXXxxx': 'access-development-_XXXxxx',
  'accountId2_XXXxxx': 'access-development-_YYYyyy'
};

// Mapping between acount ids and your account names
const ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING = {
  'accountId1_XXXxxx': '💳✈️ TD Visa',
  'accountId2_XXXxxx': '💳💵 Tangerine Mastercard'
};

// Mapping between categories returned by Plaid and your category names
const CATEGORY_MAPPING = {
  'Travel': '🚍 Public Transportation',
  'Taxi': '🚍 Public Transportation',
  'Restaurants': '🍽 Dinning Out',
  'Food': '🍽 Dinning Out',
  'Coffee': '🍽 Dinning Out',
  'Groceries': '🛒 Groceries',
  'Pharmacies': '🛒 Groceries',
  'Shops': '🛍 Shopping',
  'Transfer': '↕️ Account Transfer',
  // Add more category mappings here. See list of categories: https://gist.github.com/arbass22/e693f52ca3f168d5d6ab8afdd2f4440b
  // ...
  // Default category when no mapping is found. If you want to use the category coming from Plaid when no category is found, remove the next line
  '__defaultCategory': '🛍 Shopping'
};

// Mapping between merchant name returned by Plaid and your category names
const MERCHANT_NAME_TO_CATEGORY_MAPPING = {
  'Freedom': '📱Phone',
  'Shaw Cablesystems': '💻 Internet',
};

// Depending on your Aspire sheet date format:
//   true: 2023-02-27
//   false: 2/27/2023
const USING_ISO_FORMAT = false;

const TRANSACTION_CONFIRMED_ICON = '✅';
const TRANSACTION_PENDING_ICON = '🅿️';

const PLAID_SANDBOX_ENDPOINT = 'https://sandbox.plaid.com';
const PLAID_DEVELOPMENT_ENDPOINT = 'https://development.plaid.com';

const PLAID_GET_TRANSACTIONS_ENDPOINT = `${PLAID_DEVELOPMENT_ENDPOINT}/transactions/get`;
const PLAID_SECRET = PLAID_DEVELOPMENT_SECRET;

const MAX_TRANSACTIONS_TO_IMPORT = 500; // Can't be larger than 500
const PLAID_TRANSACTIONS_DAYS_TO_IMPORT = 14; // Importing transactions from the last 2 weeks
const TRANSACTION_MATCHING_MAX_DAYS_OF_DIFFERENCE = 10; // 2 transactions will be matched if they have the same account, same amount and the difference of days between both dates are less or equals than 10

// Starting from here you shouldn't have to change things

const TRANSACTIONS_SHEET_NAME = "Transactions";
const TRANSACTIONS_SHEET_FIRST_ROW = 9;

const TRANSACTIONS_DATE_COLUMN_INDEX = 0;
const TRANSACTIONS_OUTFLOW_COLUMN_INDEX = 1;
const TRANSACTIONS_INFLOW_COLUMN_INDEX = 2;
const TRANSACTIONS_CATEGORY_COLUMN_INDEX = 3;
const TRANSACTIONS_ACCOUNT_COLUMN_INDEX = 4;
const TRANSACTIONS_MEMO_COLUMN_INDEX = 5;
const TRANSACTIONS_STATUS_COLUMN_INDEX = 6;

function onOpen() {
   const ui = SpreadsheetApp.getUi();
   ui.createAddonMenu()
       .addItem('Download Transactions From Plaid', 'downloadTransactionsFromPlaid')
       .addToUi();
}

function onDailyScheduledExecution() {
  downloadTransactionsFromPlaid();
}

function downloadTransactionsFromPlaid() {
  let errorsDownloadingTransactions = [];
  Object.keys(ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING).forEach(accountId => {
      try {
        downloadTransactionsFromPlaidForAccountId(accountId);
      } catch (e) {
        errorsDownloadingTransactions.push(e);
        console.error(`Error downloading transactions from account "${ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING[accountId]}": ${e}`);
      }
      SpreadsheetApp.flush();
    });
  if (errorsDownloadingTransactions.length > 0) {
    throw new Error(`Error downloading transactions: ${errorsDownloadingTransactions}`);
  }
}

function downloadTransactionsFromPlaidForAccountId(accountId) {
  const startDate = getStartDate();
  const endDate = getEndDate();
  const plaidTransactionsPayload = getTransactionsFromPlaid(startDate, endDate, accountId);

  if (plaidTransactionsPayload.transactions.length > 0) {
    const transactionsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTIONS_SHEET_NAME);
    const incomingTransactions = parsePlaidTransactions(plaidTransactionsPayload);
    const existingTransactions = getTransactionsFromSheet(transactionsSheet, startDate, accountId);
    const {transactionsToUpdate, transactionsToInsert} = reconciliateTransactions(existingTransactions, incomingTransactions);
    for (transactionToUpdate of transactionsToUpdate) {
      const rowNumber = transactionToUpdate.rowNumber;
      const transactionRow = convertTransactionToRow(transactionToUpdate);
      transactionsSheet.getRange("B" + (rowNumber) + ":H" + (rowNumber)).setValues([transactionRow]);
    }
    if (transactionsToInsert.length > 0) {
      transactionsSheet.getRange("B" + (transactionsSheet.getLastRow() + 1) + ":H" + (transactionsSheet.getLastRow() + transactionsToInsert.length)).setValues(transactionsToInsert.map(transaction => convertTransactionToRow(transaction)));
    }
  }
}

function getTransactionsFromPlaid(startDate, endDate, accountId) {
  const requestInput = {
    "client_id": PLAID_CLIENT_ID,
    "secret": PLAID_SECRET,
    "access_token": ACCOUNT_ID_TO_ACCESS_TOKEN_MAPPING[accountId],
    "start_date": formatDateToISOString(startDate),
    "end_date": formatDateToISOString(endDate),
    "options": {
      "count": MAX_TRANSACTIONS_TO_IMPORT,
      "account_ids": [accountId]
    }
  };

  const options = {
    "method" : "POST",
    "contentType" : "application/json",
    "payload" : JSON.stringify(requestInput)
  };

  const response = UrlFetchApp.fetch(PLAID_GET_TRANSACTIONS_ENDPOINT, options);
  return JSON.parse(response.getContentText());
}

function parsePlaidTransactions(plaidTransactionsPayload) {
  return plaidTransactionsPayload.transactions.map(transaction => ({
      date: new Date(transaction.date),
      amount: transaction.amount,
      category: mapTransactionCategory(transaction.category, transaction.merchant_name),
      account: ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING[transaction.account_id],
      name: transaction.name,
      pending: transaction.pending
    }));
}

function getTransactionsFromSheet(transactionsSheet, startDate, accountId) {
  const lastRow = transactionsSheet.getLastRow();
  const transactionRows = transactionsSheet.getRange(`B${TRANSACTIONS_SHEET_FIRST_ROW}:H${lastRow}`).getValues();
  return transactionRows
    .map((transactionRow, index) => ({
        rowNumber: TRANSACTIONS_SHEET_FIRST_ROW + index,
        date: new Date(transactionRow[TRANSACTIONS_DATE_COLUMN_INDEX]),
        amount: transactionRow[TRANSACTIONS_OUTFLOW_COLUMN_INDEX] === '' ? -1*Number(transactionRow[TRANSACTIONS_INFLOW_COLUMN_INDEX]) : Number(transactionRow[TRANSACTIONS_OUTFLOW_COLUMN_INDEX]),
        category: transactionRow[TRANSACTIONS_CATEGORY_COLUMN_INDEX],
        account: transactionRow[TRANSACTIONS_ACCOUNT_COLUMN_INDEX],
        name: transactionRow[TRANSACTIONS_MEMO_COLUMN_INDEX],
        pending: transactionRow[TRANSACTIONS_STATUS_COLUMN_INDEX] === TRANSACTION_PENDING_ICON
      }))
    .filter((transaction) => transaction.account === ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING[accountId]
        && daysBetweenDates(startDate, transaction.date) <= TRANSACTION_MATCHING_MAX_DAYS_OF_DIFFERENCE);
}

function reconciliateTransactions(existingTransactions, incomingTransactions) {
  const indexedExistingTransactions = existingTransactions.reduce(function(map, transaction) {
    const transactionKey = buildTransactionKey(transaction);
    map[transactionKey] = map[transactionKey] || [];
    map[transactionKey].push(transaction);
    return map;
  }, {});
  const transactionsToUpdate = [];
  const transactionsToInsert = [];
  for (incomingTransaction of incomingTransactions) {
    const incomingTransactionKey = buildTransactionKey(incomingTransaction);
    if (incomingTransactionKey in indexedExistingTransactions) {
      const existingTransactions = indexedExistingTransactions[incomingTransactionKey];
      let transactionMatched = false;
      let indexOfMatchedExistingTransaction = -1;
      for (let [index, existingTransaction] of existingTransactions.entries()) {
        if (daysBetweenDates(existingTransaction.date, incomingTransaction.date) <= TRANSACTION_MATCHING_MAX_DAYS_OF_DIFFERENCE) {
          transactionMatched = true;
          indexOfMatchedExistingTransaction = index;
          if (!!existingTransaction.pending && !incomingTransaction.pending) {
            // Updating transactions only when the transactions moved from pending to cleared
            // Updating only the pending field, the rest of the fields will be kept
            transactionsToUpdate.push({
              ...existingTransaction,
              pending: false
            });
            break;
          }
        }
      }
      if (transactionMatched) {
        if (indexOfMatchedExistingTransaction >= 0) {
          // to avoid matching multiple incoming transactions to the same existing transaction
          indexedExistingTransactions[incomingTransactionKey].splice(indexOfMatchedExistingTransaction, 1);
        }
        // to avoid duplicated transactions
        continue;
      }
    }
    transactionsToInsert.push(incomingTransaction);
  }
  return {
    transactionsToUpdate,
    transactionsToInsert
  };
}

function convertTransactionToRow(transaction) {
  return [
      formatTransactionDate(transaction.date),
      transaction.amount > 0 ? `${transaction.amount}`: '',
      transaction.amount < 0 ? `${(-1*transaction.amount)}` : '',
      transaction.category,
      transaction.account,
      transaction.name,
      transaction.pending ? TRANSACTION_PENDING_ICON : TRANSACTION_CONFIRMED_ICON]
}

function daysBetweenDates(startDate, endDate) {
  return Math.round(Math.abs((endDate - startDate) / (24 * 60 * 60 * 1000)));
}

function formatTransactionDate(transactionDate) {
  if (USING_ISO_FORMAT) {
    return formatDateToISOString(transactionDate);
  }
  return transactionDate.toLocaleDateString('en-US');
}

function formatDateToISOString(date) {
  return date.toISOString().split('T')[0];
}

function mapTransactionCategory(categories, merchantName) {
  if (merchantName in MERCHANT_NAME_TO_CATEGORY_MAPPING) {
    return MERCHANT_NAME_TO_CATEGORY_MAPPING[merchantName];
  }
  for (category of categories.reverse()) {
    if (category in CATEGORY_MAPPING) {
      return CATEGORY_MAPPING[category];
    }
  }
  if ('__defaultCategory' in CATEGORY_MAPPING) {
  	return CATEGORY_MAPPING['__defaultCategory'];
  }
  if (categories.length > 0) {
    return categories[0];
  }
  return '';
}

function getStartDate() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - PLAID_TRANSACTIONS_DAYS_TO_IMPORT);
  return startDate;
}

function getEndDate() {
  return new Date();
}

function buildTransactionKey(transaction) {
  return `${transaction.amount}_${transaction.account}`;
}
