import * as z from "zod";

export const POSITIONS = ["GK", "DF", "MF", "FW"] as const;

export const DETAILED_POSITIONS = [
  "ST",
  "RW",
  "LW",
  "AM",
  "RM",
  "LM",
  "CM",
  "DM",
  "CB",
  "RB",
  "LB",
  "GK",
] as const;

export type DetailedPosition = (typeof DETAILED_POSITIONS)[number];

const snsLinkSchema = z
  .string()
  .url({ message: "無効なURLです。" })
  .optional()
  .or(z.literal(""));

const paramItemSchema = z.object({
  label: z
    .string()
    .max(8, { message: "項目名は8文字以内です。" })
    .optional()
    .or(z.literal("")),
  value: z
    .union([z.coerce.number().min(0).max(99), z.nan()])
    .optional()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
});

const overallSchema = z
  .union([z.coerce.number().min(0).max(99), z.nan()])
  .optional()
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const statNumberSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().min(0), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const contractEndYearSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().int().min(1900), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const contractEndMonthSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().int().min(1).max(12), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const tenureYearsSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.coerce.number().int().min(0).max(50).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined));

const ratingSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().min(0).max(10), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const manualCompetitionStatSchema = z.object({
  competitionId: z.string().optional().or(z.literal("")),
  matches: statNumberSchema,
  minutes: statNumberSchema,
  goals: statNumberSchema,
  assists: statNumberSchema,
  yellowCards: statNumberSchema,
  redCards: statNumberSchema,
  avgRating: ratingSchema,
});

export const formSchema = z.object({
  name: z.string().min(2, { message: "選手名は2文字以上で入力してください。" }),
  number: z.preprocess(
    (v) => {
      if (v === "" || v == null) return undefined;
      return v;
    },
    z.coerce
      .number()
      .int()
      .min(1, { message: "背番号は1以上です。" })
      .max(99, { message: "背番号は99以下です。" })
  ),
  position: z.enum(POSITIONS),
  mainPosition: z.enum(DETAILED_POSITIONS).optional(),
  subPositions: z.array(z.enum(DETAILED_POSITIONS)).max(3).optional(),
  photoUrl: z.string().url({ message: "無効なURLです。" }).optional().or(z.literal("")),
  height: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  preferredFoot: z.enum(["left", "right", "both"]).optional(),
  age: z.coerce.number().int().optional(),
  tenureYears: tenureYearsSchema,
  annualSalary: statNumberSchema,
  annualSalaryCurrency: z.enum(["JPY", "GBP", "EUR"]).optional(),
  contractEndYear: contractEndYearSchema,
  contractEndMonth: contractEndMonthSchema,
  profile: z.string().max(200, { message: "プロフィールは200文字以内です。" }).optional(),
  nationality: z.string().optional(),
  snsLinks: z
    .object({
      x: snsLinkSchema,
      youtube: snsLinkSchema,
      tiktok: snsLinkSchema,
      instagram: snsLinkSchema,
    })
    .optional(),
  params: z
    .object({
      overall: overallSchema,
      items: z.array(paramItemSchema).length(6),
    })
    .optional(),
  manualCompetitionStats: z.array(manualCompetitionStatSchema).optional(),
  teamId: z.string().optional(),
  seasons: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type PlayerFormValues = z.infer<typeof formSchema>;
