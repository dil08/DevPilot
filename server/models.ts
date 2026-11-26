import mongoose, { Schema, type Document, type Model } from 'mongoose';
import crypto from 'crypto';

export interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  role: 'engineer' | 'admin';
  createdAt: Date;
}

export interface IFinding {
  severity: string;
  file: string;
  title: string;
  detail: string;
  remediation: string;
  pathVerified: boolean;
}

export interface IAnalysisReport extends Document {
  repoName: string;
  sourceType: 'snippet' | 'upload' | 'github';
  agentId: string;
  agentName: string;
  executiveSummary: string;
  findings: IFinding[];
  fileCount: number;
  astNodeCount: number;
  edgeCount: number;
  cyclesDetected: number;
  stageTimingsMs: Record<string, number>;
  createdAt: Date;
  findingDensity: number; // Virtual
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['engineer', 'admin'], default: 'engineer' },
  },
  { timestamps: true }
);

const FindingSchema = new Schema<IFinding>(
  {
    severity: { type: String, required: true },
    file: { type: String, required: true },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    remediation: { type: String, required: true },
    pathVerified: { type: Boolean, default: false },
  },
  { _id: false }
);

const AnalysisReportSchema = new Schema<IAnalysisReport>(
  {
    repoName: { type: String, required: true, trim: true, maxlength: 140 },
    sourceType: { type: String, enum: ['snippet', 'upload', 'github'], required: true },
    agentId: { type: String, required: true, index: true },
    agentName: { type: String, required: true },
    executiveSummary: { type: String, required: true },
    findings: { type: [FindingSchema], default: [] },
    fileCount: { type: Number, required: true, min: 0 },
    astNodeCount: { type: Number, required: true, min: 0 },
    edgeCount: { type: Number, required: true, min: 0 },
    cyclesDetected: { type: Number, default: 0, min: 0 },
    stageTimingsMs: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for fast agent + chronological queries
AnalysisReportSchema.index({ agentId: 1, createdAt: -1 });

// Mongoose Virtual: findings per analyzed file
AnalysisReportSchema.virtual('findingDensity').get(function (this: IAnalysisReport) {
  if (!this.fileCount) return 0;
  return Number((this.findings.length / this.fileCount).toFixed(2));
});

// Mongoose Pre-save Middleware: normalize repoName
AnalysisReportSchema.pre('save', function () {
  if (this.repoName) {
    this.repoName = this.repoName.replace(/\s+/g, ' ').trim();
  }
});

// Mongoose Static Method
AnalysisReportSchema.statics.findRecentByAgent = function (agentId: string, limit = 10) {
  return this.find({ agentId }).sort({ createdAt: -1 }).limit(limit).lean();
};

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export const AnalysisReportModel: Model<IAnalysisReport> =
  mongoose.models.AnalysisReport ||
  mongoose.model<IAnalysisReport>('AnalysisReport', AnalysisReportSchema);

// Structured server-side memory store used only when MONGODB_URI is not configured
export interface MemoryUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'engineer' | 'admin';
  createdAt: string;
}

export interface MemoryReportRecord {
  _id: string;
  repoName: string;
  sourceType: 'snippet' | 'upload' | 'github';
  agentId: string;
  agentName: string;
  executiveSummary: string;
  findings: IFinding[];
  fileCount: number;
  astNodeCount: number;
  edgeCount: number;
  cyclesDetected: number;
  stageTimingsMs: Record<string, number>;
  findingDensity: number;
  createdAt: string;
}

export const memoryStore = {
  users: new Map<string, MemoryUserRecord>(),
  reports: [] as MemoryReportRecord[],
  createId: () => crypto.randomBytes(12).toString('hex'),
};
