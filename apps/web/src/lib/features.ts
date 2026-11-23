import type { FeatureKey } from "~/lib/analytics";
import type { MsgKey } from "~/i18n";

/** Localized label per text feature ("Asks a question"…), keyed so agent output can stay English. */
export const FEATURE_LABEL: Record<FeatureKey, MsgKey> = {
  question: "ins.feat.question",
  comments: "ins.feat.comments",
  number: "ins.feat.number",
  firstline: "ins.feat.firstline",
  link: "ins.feat.link",
  hashtags: "ins.feat.hashtags",
};

/** The same features as sentence fragments, for "Posts that {says}…" callouts. */
export const FEATURE_SAYS: Record<FeatureKey, MsgKey> = {
  question: "ins.says.question",
  comments: "ins.says.comments",
  number: "ins.says.number",
  firstline: "ins.says.firstline",
  link: "ins.says.link",
  hashtags: "ins.says.hashtags",
};
