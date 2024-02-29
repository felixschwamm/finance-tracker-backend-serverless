import * as Joi from 'joi';

export const GetExpensesSchema = Joi.object({
    queryStringParameters: Joi.object({
        year: Joi.number().optional(),
        month: Joi.number().optional(),
        sort: Joi.string().valid('NEWEST', 'EXPENSIVE').optional()
    }).optional().allow(null),
}).unknown(true);

export const CreateExpenseSchema = Joi.object({
    body: Joi.object({
        name: Joi.string().required(),
        amount: Joi.number().required(),
        date: Joi.date().optional().default((new Date()).toISOString()),
        category: Joi.string().valid("ESSEN", "FREIZEIT", "GESUNDHEIT", "KLEIDUNG", "TRANSPORT", "WOHNEN", "SONSTIGES").default("SONSTIGES")
    }).required(),
}).unknown(true);

export const DeleteExpenseSchema = Joi.object({
    pathParameters: Joi.object({
        id: Joi.string().required()
    }).required(),
}).unknown(true);

export const UpdateExpenseSchema = Joi.object({
    pathParameters: Joi.object({
        id: Joi.string().required()
    }).required(),
    body: Joi.object({
        name: Joi.string().optional(),
        amount: Joi.number().optional(),
        date: Joi.date().optional(),
        category: Joi.string().valid("ESSEN", "FREIZEIT", "GESUNDHEIT", "KLEIDUNG", "TRANSPORT", "WOHNEN", "SONSTIGES").optional()
    }).required(),
}).unknown(true);

export const UpdateBudgetSchema = Joi.object({
    body: Joi.object({
        budget: Joi.number().required()
    }).required(),
}).unknown(true);

export const GetOverviewSchema = Joi.object({
    queryStringParameters: Joi.object({
        year: Joi.number().optional(),
    }).optional().allow(null),
}).unknown(true);