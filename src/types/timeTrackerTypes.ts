export type ruleType = "only notify" | "notify & close" | "notify, close & block";

export type TimeTrackerRuleObj = {
    id: string;
    site_or_app_name: string;
    minutesDailyLimit: number;
    rule: ruleType;
    category: string;
    remainingTimeMin: number;
};