import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, QueryCommandInput, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { CreateExpenseSchema, DeleteExpenseSchema, GetExpensesSchema, GetOverviewSchema, UpdateBudgetSchema, UpdateExpenseSchema } from './schemas';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: 'eu-central-1' });

function convertDynamoDbExpenseToExpense(dynamoDbExpense: any) {
  return {
    id: dynamoDbExpense.SK.split('#')[1],
    amount: dynamoDbExpense.EXPENSE_AMOUNT,
    date: new Date(dynamoDbExpense.EXPENSE_DATE * 1000),
    category: dynamoDbExpense.EXPENSE_CATEGORY,
    name: dynamoDbExpense.EXPENSE_NAME,
  };
}

function getUserId(event: any) {
  if (process.env.IS_OFFLINE) {
    return 'testUser';
  } else {
    return event.requestContext.authorizer.jwt.claims.sub;
  }
}

function convertExpenseToDynamoDbExpense(expense: any, id: string, userId: string = 'testUser') {
  return {
    PK: { S: `USER#${userId}` }, // TODO: Replace with `USER#${expense.userId}
    SK: { S: `EXPENSE#${id}` },
    EXPENSE_AMOUNT: { N: expense.amount.toString() },
    EXPENSE_USER_YEAR: { S: `${userId}#${expense.date.getFullYear()}` },
    EXPENSE_DATE: { N: (expense.date.getTime() / 1000).toString() },
    EXPENSE_CATEGORY: { S: expense.category },
    EXPENSE_NAME: { S: expense.name },
    EXPENSE_USER_DATE: { S: `${userId}#${expense.date.getFullYear()}#${expense.date.getMonth() + 1}` },
  };
}

async function createExpense(event) {
  event.body = JSON.parse(event.body);
  const { error, value } = CreateExpenseSchema.validate(event);
  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const expense = value.body;
  expense.date = new Date(expense.date);

  const id = uuidv4();
  const userId = getUserId(event);

  await client.send(new PutItemCommand({
    TableName: 'finance-app',
    Item: convertExpenseToDynamoDbExpense(expense, id, userId),
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      ...expense,
      id,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

async function deleteExpense(event) {
  const { error, value } = DeleteExpenseSchema.validate(event);
  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const expenseId = value.pathParameters.id;
  const userId = getUserId(event);

  await client.send(new DeleteItemCommand({
    TableName: 'finance-app',
    Key: {
      PK: { S: `USER#${userId}` },
      SK: { S: `EXPENSE#${expenseId}` },
    },
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  };

}

async function getExpenses(event) {
  const { error, value } = GetExpensesSchema.validate(event);
  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const year = value.queryStringParameters?.year || new Date().getFullYear();
  const month = value.queryStringParameters?.month || new Date().getMonth() + 1;
  const userId = getUserId(event);

  let query: QueryCommandInput;

  if (value.queryStringParameters?.sort === 'NEWEST') {
    query = {
      TableName: 'finance-app',
      ScanIndexForward: false,
      IndexName: 'EXPENSE_USER_DATE-EXPENSE_DATE-index',
      KeyConditionExpression: 'EXPENSE_USER_DATE = :exp_user_date',
      ExpressionAttributeValues: {
        ':exp_user_date': { S: `${userId}#${year}#${month}` }
      },
    };
  } else {
    query = {
      TableName: 'finance-app',
      IndexName: 'EXPENSE_USER_DATE-EXPENSE_AMOUNT-index',
      KeyConditionExpression: 'EXPENSE_USER_DATE = :exp_user_date',
      ExpressionAttributeValues: {
        ':exp_user_date': { S: `${userId}#${year}#${month}` }
      },
    };
  }

  const res = await client.send(new QueryCommand(query));

  return {
    statusCode: 200,
    body: JSON.stringify(res.Items?.map(item => unmarshall(item)).map(item => convertDynamoDbExpenseToExpense(item))),
    headers: {
      'Content-Type': 'application/json',
    },
  };
};

async function updateExpense(event) {
  event.body = JSON.parse(event.body);

  const { error, value } = UpdateExpenseSchema.validate(event);
  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const { name, amount, date, category } = value.body;
  const updateElements: string[] = [];
  const expressionAttributeValues: any = {};
  const expressionAttributeNames: any = {};
  if (name) {
    updateElements.push(`#name = :name`);
    expressionAttributeValues[':name'] = { S: name };
    expressionAttributeNames['#name'] = 'EXPENSE_NAME';
  }
  if (amount) {
    updateElements.push(`#amount = :amount`);
    expressionAttributeValues[':amount'] = { N: amount.toString() };
    expressionAttributeNames['#amount'] = 'EXPENSE_AMOUNT';
  }
  if (date) {
    updateElements.push(`#date = :date`);
    expressionAttributeValues[':date'] = { N: (new Date(date).getTime() / 1000).toString() };
    expressionAttributeNames['#date'] = 'EXPENSE_DATE';
  }
  if (category) {
    updateElements.push(`#category = :category`);
    expressionAttributeValues[':category'] = { S: category };
    expressionAttributeNames['#category'] = 'EXPENSE_CATEGORY';
  }

  const userId = getUserId(event);

  await client.send(new UpdateItemCommand({
    TableName: 'finance-app',
    Key: {
      PK: { S: `USER#${userId}` },
      SK: { S: `EXPENSE#${value.pathParameters.id}` },
    },
    UpdateExpression: `SET ${updateElements.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  }
}

async function getBudget(event) {
  const userId = getUserId(event);

  const res = await client.send(new GetItemCommand({
    TableName: 'finance-app',
    Key: {
      PK: { S: `USER#${userId}` },
      SK: { S: `USER#${userId}` },
    },
  }));

  if (!res.Item) {
    // set default budget to 1000
    await client.send(new PutItemCommand({
      TableName: 'finance-app',
      Item: {
        PK: { S: `USER#${userId}` },
        SK: { S: `USER#${userId}` },
        BUDGET: { N: '1000' },
      },
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        budget: 1000,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      budget: Number(res.Item?.BUDGET.N),
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  };

}

async function updateBudget(event) {
  event.body = JSON.parse(event.body);

  const { error, value } = UpdateBudgetSchema.validate(event);

  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const userId = getUserId(event);

  await client.send(new UpdateItemCommand({
    TableName: 'finance-app',
    Key: {
      PK: { S: `USER#${userId}` },
      SK: { S: `USER#${userId}` },
    },
    UpdateExpression: 'SET BUDGET = :budget',
    ExpressionAttributeValues: {
      ':budget': { N: value.body.budget.toString() },
    },
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

async function getOverview(event) {
  const userId = getUserId(event);

  const { error, value } = GetOverviewSchema.validate(event);

  if (error) {
    return {
      statusCode: 400,
      body: JSON.stringify(error.details),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const year = value.queryStringParameters?.year || new Date().getFullYear();
  const summedExpensesPerCategoryPerMonth: any[] = [];

  for (let i = 0; i < 12; i++) {
    summedExpensesPerCategoryPerMonth[i] = {
      ESSEN: 0,
      FREIZEIT: 0,
      GESUNDHEIT: 0,
      KLEIDUNG: 0,
      TRANSPORT: 0,
      WOHNEN: 0,
      SONSTIGES: 0,
    };
  }

  const res = await client.send(new QueryCommand({
    TableName: 'finance-app',
    KeyConditionExpression: 'EXPENSE_USER_YEAR = :exp_user_year',
    ExpressionAttributeValues: {
      ':exp_user_year': { S: `${userId}#${year}` },
    },
    IndexName: 'EXPENSE_USER_YEAR-index',
    ScanIndexForward: false,
  }));

  res.Items?.map(item => unmarshall(item)).forEach(item => {
    const date = new Date(item.EXPENSE_DATE * 1000);
    const month = date.getMonth();
    const category = item.EXPENSE_CATEGORY;
    const amount = item.EXPENSE_AMOUNT;

    summedExpensesPerCategoryPerMonth[month][category] += amount;

  });

  return {
    statusCode: 200,
    body: JSON.stringify(summedExpensesPerCategoryPerMonth),
    headers: {
      'Content-Type': 'application/json',
    },
  };

}

export { getExpenses, createExpense, deleteExpense, updateExpense, getBudget, updateBudget, getOverview };