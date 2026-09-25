export interface ExamSummary {
  id: number;
  name: string;
  subject: string | null;
  numQuestions: number;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | string;
}

export interface Exam extends ExamSummary {
  description: string | null;
  passingMarks: number;
  negativeMarking: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  maxAttempts: number;
  webcamRequired?: boolean;
  microphoneRequired?: boolean;
  screenRequired?: boolean;
  locationRequired?: boolean;
  proctoringConfig?: string;
  audioInputLevel?: number;
}

export interface ExamQuestion {
  id: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: number;
  marks: number;
}

export interface ExamAssignmentItem {
  id: number;
  studentEmail: string;
  createdAt: string;
}

export interface StudentQuestion {
  questionId: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

export interface StartExamResponse {
  attemptId: number;
  durationMinutes: number;
  serverStartTime: string;
  questions: StudentQuestion[];
  webcamRequired?: boolean;
  microphoneRequired?: boolean;
  screenRequired?: boolean;
  locationRequired?: boolean;
  audioInputLevel?: number;
}

export interface AttemptResult {
  attemptId: number;
  status: string;
  startTime: string;
  endTime: string;
  score: number;
  totalQuestions: number;
  answeredQuestions: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresInSeconds: number;
}

export interface ProctoringSession {
  id: number;
  attemptId: number;
  webcamRequired: boolean;
  microphoneRequired: boolean;
  screenRequired: boolean;
  locationRequired: boolean;
  webcamStatus: string;
  microphoneStatus: string;
  screenStatus: string;
  connectionStatus: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
  endedAt: string | null;
}

export interface ClientEventItem {
  eventType: string;
  occurredAt: string;
  durationSeconds?: number;
  metadata?: string;
}

export interface ProctoringEvent {
  id: number;
  attemptId: number;
  eventType: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  confidence: number;
  occurredAt: string;
  durationSeconds: number | null;
  metadata: string | null;
  createdAt: string;
}

export interface AdminAttemptSummary {
  attemptId: number;
  examId: number;
  studentEmail: string;
  attemptNumber: number;
  status: string;
  startTime: string;
  endTime: string | null;
  score: number | null;
  totalEvents: number;
  infoEvents: number;
  lowEvents: number;
  mediumEvents: number;
  highEvents: number;
  criticalEvents: number;
  currentRiskScore?: number;
  flaggedForReview?: boolean;
  proctoringSession: ProctoringSession | null;
}

export interface WarningResponse {
  id: number;
  attemptId: number;
  level: number;
  message: string;
  riskScoreAtTime: number;
  createdAt: string;
}

export interface RiskPoint {
  timestamp: string;
  score?: number;
  riskScore?: number;
  eventType?: string | null;
  warningLevel?: number | null;
}

export interface RiskTimelineResponse {
  attemptId: number;
  currentRiskScore: number;
  flaggedForReview: boolean;
  warnings: WarningResponse[];
  scoreHistory: RiskPoint[];
}

export interface AiFrameAnalysisResponse {
  faceDetected: boolean;
  faceCount: number;
  phoneDetected?: boolean;
  objectDetected?: boolean;
  detectedObjects?: string[];
  personBehindDetected?: boolean;
  cameraCovered?: boolean;
  gazeDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" | string;
  headPose: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  confidence: number;
  events?: Array<{
    type: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }>;
  modelVersion?: string;
}

export interface DashboardSummary {
  totalExams: number;
  activeExams: number;
  completedAttempts: number;
  studentsCurrentlyWriting: number;
  warningsToday: number;
  highSeverityEventsToday: number;
}

export interface LabelValue {
  label: string;
  value: number;
}

export interface TimeSeriesPoint {
  hour?: string;
  count?: number;
  timestamp?: string;
  value?: number;
}

export interface DashboardCharts {
  warningsByExam: LabelValue[];
  warningsByType: LabelValue[];
  warningsTimeline: TimeSeriesPoint[];
  scoreDistribution: LabelValue[];
}

export interface AdminAttemptReport {
  attemptId: number;
  examId: number;
  studentEmail: string;
  studentName: string | null;
  attemptNumber: number;
  examName: string;
  examSubject: string | null;
  examDurationMinutes: number;
  status: string;
  startTime: string;
  endTime: string | null;
  score: number | null;
  flaggedForReview: boolean;
  currentRiskScore: number;
  events: ProctoringEvent[];
  warnings: WarningResponse[];
  riskTimeline: RiskPoint[];
  totalEvents: number;
  infoEvents: number;
  lowEvents: number;
  mediumEvents: number;
  highEvents: number;
  criticalEvents: number;
  answers?: AdminQuestionAnswer[];
}

export interface AdminQuestionAnswer {
  questionId: number;
  displayOrder: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selectedOption: number | null;
  correctAnswer: number;
  isCorrect: boolean | null;
  marksAwarded: number;
  maxMarks: number;
}

export interface AdminAttemptEvaluationRequest {
  score: number;
  status?: string;
  flaggedForReview?: boolean;
  feedback?: string;
}
