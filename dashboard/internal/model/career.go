package model

// PipelineInboxItem represents a URL in the processing pipeline,
// enriched with light-pass and deep-pass state from data/pass-history.tsv.
type PipelineInboxItem struct {
	Number    int
	URL       string
	Company   string
	Role      string
	Source    string // linkedin, glassdoor, greenhouse, lever, ashby, etc.
	Processed bool   // true if marked [x] in pipeline.md

	// Light-pass state (from data/pass-history.tsv)
	LightScore float64 // 0 = not light-passed
	LightAt    string  // YYYY-MM-DD when scored

	// Deep-pass state (from data/pass-history.tsv)
	DeepReport string  // report number, empty if not deep-passed
	DeepScore  float64 // 0 if not deep-passed
	DeepAt     string  // YYYY-MM-DD when deep-evaluated
}

// PipelineInboxStats aggregates the inbox for the header row.
type PipelineInboxStats struct {
	Total       int
	Untouched   int // no light, no deep
	LightOnly   int // light done, deep pending
	DeepDone    int // deep done (with or without light)
	AvgLight    float64
	AvgDeep     float64
}

// CareerApplication represents a single job application from the tracker.
type CareerApplication struct {
	Number       int
	Date         string
	Company      string
	Role         string
	Status       string
	Score        float64
	ScoreRaw     string
	HasPDF       bool
	ReportPath   string
	ReportNumber string
	Notes        string
	JobURL       string // URL of the original job posting
	// Enrichment (lazy loaded from report)
	Archetype    string
	TlDr         string
	Remote       string
	CompEstimate string
}

// PipelineMetrics holds aggregate stats for the pipeline dashboard.
type PipelineMetrics struct {
	Total      int
	ByStatus   map[string]int
	AvgScore   float64
	TopScore   float64
	WithPDF    int
	Actionable int
}

// ProgressMetrics holds job search progress analytics.
type ProgressMetrics struct {
	// Funnel
	FunnelStages []FunnelStage

	// Score distribution
	ScoreBuckets []ScoreBucket

	// Timeline (weekly activity)
	WeeklyActivity []WeekActivity

	// Rates
	ResponseRate  float64 // Responded / Applied
	InterviewRate float64 // Interview / Applied
	OfferRate     float64 // Offer / Applied

	// Averages
	AvgScore     float64
	TopScore     float64
	TotalOffers  int
	ActiveApps int // not skip/rejected/discarded
}

// FunnelStage represents one stage of the application funnel.
type FunnelStage struct {
	Label string
	Count int
	Pct   float64 // percentage of total
}

// ScoreBucket represents a score range and its count.
type ScoreBucket struct {
	Label string // e.g., "4.5-5.0", "4.0-4.4", "3.5-3.9", "3.0-3.4", "<3.0"
	Count int
}

// WeekActivity represents application activity for a given ISO week.
type WeekActivity struct {
	Week  string // e.g., "2026-W14", "2026-W13"
	Count int
}
