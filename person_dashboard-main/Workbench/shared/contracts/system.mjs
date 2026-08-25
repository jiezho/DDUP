import { z } from 'zod'

export const HealthDataSchema = z.object({
  service: z.literal('personal-ai-workbench'),
  status: z.enum(['ok', 'degraded']),
  app_version: z.string().min(1),
  runtime: z.object({
    node: z.string().regex(/^v24\./),
    sqlite: z.literal('available'),
  }),
})

export const CapabilityStateSchema = z.enum([
  'available',
  'prototype',
  'poc_not_connected',
  'candidate_not_connected',
  'not_implemented',
  'disabled',
])

export const CapabilitiesDataSchema = z.object({
  local_session: CapabilityStateSchema,
  projects: CapabilityStateSchema,
  knowledge: CapabilityStateSchema,
  native_runtime: CapabilityStateSchema,
  deepseek_harness: CapabilityStateSchema,
  hermes: CapabilityStateSchema,
  persistence: CapabilityStateSchema,
})
