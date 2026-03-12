package compiler

type PhaseStatus string

const (
	PhasePass PhaseStatus = "pass"
	PhaseFail PhaseStatus = "fail"
	PhaseSkip PhaseStatus = "skip"
)

const RequirementScoreThreshold = 75

type CompileError struct {
	File     string `json:"file,omitempty"`
	Line     int    `json:"line,omitempty"`
	Column   int    `json:"column,omitempty"`
	Message  string `json:"message"`
	Severity string `json:"severity"` // "error" | "warning"
}

type PhaseResult struct {
	Status     PhaseStatus    `json:"status"`
	DurationMs int64          `json:"durationMs"`
	Output     string         `json:"output,omitempty"`
	Errors     []CompileError `json:"errors"`
}

type FeatureResult struct {
	FeatureName       string   `json:"featureName"`
	FeaturePath       string   `json:"featurePath"`
	MappedFiles       []string `json:"mappedFiles"`
	CodegenStatus     string   `json:"codegenStatus"` // "generated" | "unchanged" | "failed"
	RequirementScore  int      `json:"requirementScore"`
	RequirementIssues []string `json:"requirementIssues"`
}

type Summary struct {
	FeaturesProcessed int `json:"featuresProcessed"`
	CodeFilesModified int `json:"codeFilesModified"`
	TypeErrors        int `json:"typeErrors"`
	TestsPassed       int `json:"testsPassed"`
	TestsFailed       int `json:"testsFailed"`
	RequirementScore  int `json:"requirementScore"`
}

type CompilationReport struct {
	ProjectName string `json:"projectName"`
	Status      string `json:"status"` // "success" | "failed" | "partial"
	StartedAt   string `json:"startedAt"`
	DurationMs  int64  `json:"durationMs"`
	Phases      struct {
		Codegen      PhaseResult `json:"codegen"`
		Typecheck    PhaseResult `json:"typecheck"`
		Tests        PhaseResult `json:"tests"`
		Requirements PhaseResult `json:"requirements"`
	} `json:"phases"`
	Features []FeatureResult `json:"features"`
	Summary  Summary         `json:"summary"`
}
