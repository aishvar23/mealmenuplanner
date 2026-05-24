// `grocery` service barrel (design/08 § 9/§ 10, P7-1/P7-2/P7-3). List generation,
// the member-gated read, and item check-off. The pure aggregation core, request
// validators, and DTO mappers live alongside; the write goes through the
// `replace_grocery_list` SECURITY DEFINER RPC.
export * from "./aggregate";
export * from "./dto";
export * from "./validate";
export * from "./load";
export * from "./reads";
export * from "./generate";
export * from "./items";
