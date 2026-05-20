export type MorningPull = {
  date: string;
  created_at: string;
  activity_count?: number;
  activities?: unknown;
  health?: unknown;
  health_details?: Record<string, unknown>;
  notes: string[];
};

export type ActivityDataSource = "coros_direct" | "runalyze" | "none" | "mixed";

export type CorosActivity = {
  source: "coros_direct";
  id?: string;
  date: string;
  name?: string;
  sport_type?: number;
  sport_name?: string;
  duration_seconds?: number;
  distance_m?: number;
  ascent_m?: number;
  descent_m?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  avg_cadence?: number;
  avg_power_w?: number;
  max_power_w?: number;
  normalized_power_w?: number;
  training_load?: number;
  calories?: number;
  temperature_c?: number;
};

export type CorosDailyMetrics = {
  date: string;
  rhr_bpm?: number;
  time_in_bed_hours?: number;
  sleep_hours?: number;
  sleep_total_minutes?: number;
  sleep_deep_minutes?: number;
  sleep_light_minutes?: number;
  sleep_rem_minutes?: number;
  sleep_awake_minutes?: number;
  sleep_short_minutes?: number;
  sleep_avg_hr_bpm?: number;
  sleep_min_hr_bpm?: number;
  sleep_max_hr_bpm?: number;
  avg_sleep_hrv?: number;
  sleep_hrv_baseline?: number;
  vo2max?: number;
  stamina_level?: number;
  stamina_level_7d?: number;
  training_load?: number;
  fatigue_index?: number;
  fatigue_state?: number;
  training_load_ratio?: number;
  lthr_bpm?: number;
  lt_pace_sec_per_km?: number;
};

export type CorosDirectPull = {
  date: string;
  activity_date?: string;
  metrics_date?: string;
  created_at: string;
  source: "coros_direct";
  target_day?: CorosDailyMetrics;
  recent_days: CorosDailyMetrics[];
  activity_count?: number;
  activities?: CorosActivity[];
  notes: string[];
};

export type PlannedSession = {
  "Session": string;
  "Date": string;
  "Week": string;
  "Type": string;
  "Planned duration min": number;
  "Planned ascent m": number;
  "Target intensity": string;
  "HR cap bpm"?: number;
  "Target RPE": number;
  "Priority": string;
  "Notes": string;
};

export type RecommendationLevel = "green" | "orange" | "red";

export type ConditionLoad = {
  minutes: number;
  ascent_m: number;
  activity_count: number;
  source: ActivityDataSource;
};

export type ConditionWindowLoad = ConditionLoad & {
  expected_days: number;
  available_days: number;
  complete: boolean;
  start_date: string;
  end_date: string;
  dates: string[];
};

export type ConditionMetricSnapshot = {
  sleep_hours?: number;
  hrv?: number;
  hrv_baseline?: number;
  resting_hr_bpm?: number;
  coros_training_load?: number;
  coros_fatigue_index?: number;
  coros_fatigue_state?: number;
  coros_training_load_ratio?: number;
  coros_stamina_level?: number;
  coros_vo2max?: number;
  available: string[];
  missing: string[];
};

export type ConditionRecovery = {
  score: number | null;
  level: RecommendationLevel;
  metrics: ConditionMetricSnapshot;
  reasons: string[];
};

export type ConditionDataQuality = {
  level: "good" | "partial" | "limited";
  available: string[];
  missing: string[];
  notes: string[];
};

export type ConditionFlag = {
  level: RecommendationLevel;
  code: string;
  message: string;
};

export type ConditionTrend = {
  status: "available" | "limited";
  note: string;
  seven_days: ConditionWindowLoad;
  twenty_eight_days: ConditionWindowLoad;
};

export type ConditionAnalysis = {
  date: string;
  pull_date: string;
  metrics_date: string;
  created_at: string;
  level: RecommendationLevel;
  source_files: string[];
  yesterday_load: ConditionLoad;
  recovery: ConditionRecovery;
  data_quality: ConditionDataQuality;
  flags: ConditionFlag[];
  trends: ConditionTrend;
  limits: string[];
  summary: string[];
};

export type TrainingRecommendation = {
  date: string;
  created_at: string;
  level: RecommendationLevel;
  decision: "maintain" | "reduce" | "replace_easy" | "swap" | "rest";
  today?: PlannedSession;
  swap_with?: PlannedSession;
  recommended_session: {
    name: string;
    duration_min: number;
    ascent_m: number;
    intensity: string;
    fc_cap_bpm?: number;
    notes: string;
  };
  reasons: string[];
  data_quality: string[];
};
