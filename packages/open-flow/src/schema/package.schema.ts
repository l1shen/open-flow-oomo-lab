import { z } from 'zod'

export const PackageSchema = /* @__PURE__ */ z.preprocess(
  (value) => (value == null ? {} : value),
  /* @__PURE__ */ z.strictObject({
    name: z.string().optional().describe('Project name'),
    displayName: z.string().optional().describe('Project display name'),
    description: z.string().optional().describe('Project description'),
    icon: z.string().optional().describe('Project icon URI'),
  }),
)
