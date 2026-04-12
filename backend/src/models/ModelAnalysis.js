import mongoose from 'mongoose';

const ModelAnalysisSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date },
  modelName: { type: String },
  labelCol: { type: String },
  sensitiveCol: { type: String },
  detectReport: { type: mongoose.Schema.Types.Mixed },
  mitigationResult: { type: mongoose.Schema.Types.Mixed },
});

export const ModelAnalysis = mongoose.model('ModelAnalysis', ModelAnalysisSchema);
