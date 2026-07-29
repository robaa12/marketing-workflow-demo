import { z } from 'zod';

/**
 * One realistic buyer persona.
 * Field set is broad so downstream agents (journey, SMART) can pick the bits
 * they need without round-tripping back to the LLM.
 */
export const BuyerPersonaSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Stable kebab-case id (e.g. "growth-lead-priya").'),
  name: z.string().min(1).describe('Fictional full name.'),
  role: z.string().min(2).describe('Job title or life role.'),
  archetype: z
    .string()
    .min(2)
    .describe('Short archetype label (e.g. "Pragmatic operator", "Status seeker").'),
  segmentId: z
    .string()
    .min(1)
    .describe('Foreign key to the STP segment this persona belongs to.'),
  company: z.string().optional().describe('For B2B: company name placeholder.'),
  companySize: z
    .string()
    .optional()
    .describe('For B2B: employee count or revenue band.'),
  age: z.number().int().min(13).max(99).optional().describe('For B2C personas.'),
  location: z.string().optional(),
  goals: z.array(z.string().min(5)).min(1).max(5),
  frustrations: z.array(z.string().min(5)).min(1).max(5),
  painPoints: z.array(z.string().min(5)).min(1).max(5),
  motivations: z.array(z.string().min(5)).min(1).max(5),
  buyingTriggers: z
    .array(z.string().min(5))
    .min(1)
    .max(5)
    .describe('Events that push the persona into active evaluation.'),
  objections: z
    .array(z.string().min(5))
    .min(1)
    .max(5)
    .describe('Reasons the persona hesitates to buy.'),
  decisionCriteria: z
    .array(z.string().min(5))
    .min(1)
    .max(5)
    .describe('What they weigh when comparing options.'),
  preferredChannels: z
    .array(z.string().min(2))
    .min(1)
    .max(8)
    .describe('Communication channels this persona actually uses.'),
  preferredContent: z
    .array(z.string().min(2))
    .min(1)
    .max(6)
    .describe('Content formats the persona actually consumes.'),
  influenceMap: z
    .array(z.string())
    .default([])
    .describe('Who/what influences this persona (peers, publications, communities).'),
  summary: z
    .string()
    .min(20)
    .describe('One paragraph that brings the persona to life.'),
});
export type BuyerPersona = z.infer<typeof BuyerPersonaSchema>;
