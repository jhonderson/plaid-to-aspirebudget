# Plaid to Aspire Budget Google Spreadsheet

Google AppScript script to retrieve transactions from Plaid API and store them in Aspire Budget Google Spreadsheet

## How it works

1. For each account you configure, it will retrieve the last 2 weeks of transactions (you can change this date range) and insert them in your Transactions sheet.
2. New transactions will be inserted after your last transaction row. For duplicated transactions (see how transactions are matched next) the script will update the existing transactions only of the incoming transaction is cleared (i.e not pending) and the existent transaction is pending. The only field that will be updated is the pending field. This is to give priority to the values entered manually by the user.
3. How transactions are matched (i.e when a transaction is treated as duplicated)? 2 transactions are matched when they come from the same account, they have the same amount value, and the difference of days between both dates is less or equals than 10 (you can change the 10 days value).
4. You can configure this script in your Google spreadsheet and execute it manually or schedule it.

## Setup

### Get Plaid Access Token

1. You need to create a Plaid developer account. Create your Plaid account using this link: https://dashboard.plaid.com/signup.
2. Go to https://dashboard.plaid.com/overview/development, and request development access to Plaid team. This should take 1 day or 2. Feel free to use the Sandbox environment for testing purposes, but keep in mind the Sandbox environment has no real data.
3. Set up the Plaid Quickstart app on your machine by following these instructions: https://plaid.com/docs/quickstart/.
4. If you are planning to use Development environment (i.e real data), follow these additional steps:
   1. Go to https://dashboard.plaid.com/team/api and in the section "Allowed redirect URIs add the url: https://localhost:3000/
   2. Copy the example environment file in this project ([.env.example](.env.example)) to your quickstart node folder: `quickstart/node/.env`. Change the following variables with your credentials: `PLAID_CLIENT_ID` and `PLAID_SECRET`. If you want to retrieve credit cards I recommend you setting this variable: `PLAID_PRODUCTS=transactions,liabilities`
   3. Create a certificate for localhost following these steps: https://github.com/plaid/quickstart/blob/master/README.md#testing-oauth.
5. Start the Quickstart application (backend and frontend) and then use Plaid Link to connect to one of your bank accounts. Once you're connected, the Quickstart app will show your access_token. Copy it somewhere as you will need it later to set up the script in your Google Spreadsheet

You need to know the Plaid account ids for each of the accounts you want to retrieve transactions from. Use this command to retrieve the list of accounts, and take a note of the account ids you want to use:
```bash
# For Sandbox use https://sandbox.plaid.com/accounts/get 
curl -X POST https://development.plaid.com/accounts/get \
-H 'Content-Type: application/json' \
-d '{
  "client_id": "<your Plaid client id>",
  "secret": "<your Plaid secret>",
  "access_token": "<your Plaid access token>"
}'
```

Sample response
```bash
{
  "accounts": [
    {
      "account_id": "accountId1_XXXxxx",
      // ...
      "name": "Plaid Checking"
    },
    {
      "account_id": "accountId2_XXXxxx",
      // ...
      "name": "Plaid Saving"
    }
  ],
  // ...
}
```

### Set up the code in App Script

1. Go to your Aspire Budget Google spreadsheet.
2. Go to Extensions -> Apps Script. Name your project, we will assume it is called **Aspire** in this tutorial.
3. In the Apps Script editor. Copy the content of the script [Code.gs](Code.gs) in this repo and pasted in the App Script editor, in the `Code.gs` file.

Configure Plaid credentials:
```javascript
const PLAID_CLIENT_ID = `XXXxxx`;
const PLAID_SANDBOX_SECRET = `XXXxxx`; // ignore if using Development environment
const PLAID_DEVELOPMENT_SECRET = `XXXxxx`; // ignore if using Sandbox environment
```

Because you may have accounts from different banks, each account may have a different access token. Configure the mapping between Plaid account ids and access tokens in these lines:
```javascript
// Mapping between account ids and Plaid access token
const ACCOUNT_ID_TO_ACCESS_TOKEN_MAPPING = {
  'accountId1_XXXxxx': 'access-development-_XXXxxx',
  'accountId2_XXXxxx': 'access-development-_YYYyyy'
};
```

The account ids are the ones you retrieved from Plaid using the `curl` command.

Configure the mapping between account ids and the account names you use in your Google spreadsheet:
```javascript
// Mapping between acount ids and your account names
const ACCOUNT_ID_TO_ACCOUNT_NAME_MAPPING = {
  'accountId1_XXXxxx': '💳✈️ TD Visa',
  'accountId2_XXXxxx': '💳💵 Tangerine Mastercard'
};
```

Configure the mapping between categories provided by Plaid and the categories you use in your Google spreadsheet:
```javascript
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
```

Configure the following variable depending onthe date format you use in Google spreadsheet:
```javascript
//   true: 2023-02-27
//   false: 2/27/2023
const USING_ISO_FORMAT = false;
```

Configure additional script parameters:
```javascript
const MAX_TRANSACTIONS_TO_IMPORT = 500; // Can't be larger than 500
const PLAID_TRANSACTIONS_DAYS_TO_IMPORT = 14; // Importing transactions from the last 2 weeks
const TRANSACTION_MATCHING_MAX_DAYS_OF_DIFFERENCE = 10; // 2 transactions will be matched if they have the same account, same amount and the difference of days between both dates are less or equals than 10
```

Depending on the Plaid environment you use, configure these variables (following values are for Development):
```javascript
const PLAID_GET_TRANSACTIONS_ENDPOINT = `${PLAID_DEVELOPMENT_ENDPOINT}/transactions/get`; // PLAID_SANDBOX_ENDPOINT for Sandbox
const PLAID_SECRET = PLAID_DEVELOPMENT_SECRET; // PLAID_SANDBOX_SECRET for Sandbox
```

There are 2 ways to execute the transactions retrieval process, manual ad-hoc execution or scheduling:
1. Go to your Google spreadsheet and click Extensions > Aspire > Download Transactions From Plaid
2. In your AppScript project, go to Triggers and add a new trigger. For daily executions at midnight use these options:
   - Choose which function to run: `onDailyScheduledExecution`
   - Which runs at deployment: `Head`
   - Select event source: `Time-driven`
   - Select type of time based trigger: `Day timer`
   - Select time of day: `Midnight to 1am`

## Contribute 

Feel free to submit pull requests for improvements or fixes. Just try to avoid ad-hoc changes that only work for your use case.