import { z } from 'zod';

const NullableTextSchema = z.string().nullable();

export const ContentItemGenerationInputSchema = z.object({
  project: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: NullableTextSchema,
  }),
  campaign: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: NullableTextSchema,
    objective: NullableTextSchema,
    audience: NullableTextSchema,
    tone: NullableTextSchema,
    channels: z.array(z.string()).max(20),
    startDate: z.string().datetime().nullable(),
    endDate: z.string().datetime().nullable(),
  }),
  type: z.string().min(1).max(60),
  instructions: z.string().max(4_000).optional(),
  previous: z
    .object({
      title: NullableTextSchema,
      body: NullableTextSchema,
      payload: z.unknown(),
    })
    .nullable()
    .optional(),
});
export type ContentItemGenerationInput = z.infer<
  typeof ContentItemGenerationInputSchema
>;

const PayloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const GeneratedContentItemSchema = z.object({
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(50_000),
  payload: z.record(z.string(), PayloadValueSchema).default({}),
  format: z.enum(['TEXT', 'MARKDOWN', 'HTML', 'JSON']).default('MARKDOWN'),
});
export type GeneratedContentItem = z.infer<typeof GeneratedContentItemSchema>;
