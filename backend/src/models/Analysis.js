import mongoose from 'mongoose';

const AnalysisSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date },
  input: {
    fileName: String,
    domain: String,
    targetColumn: String,
    predictionColumn: String,
    sensitiveColumns: [String],
    positiveLabel: String,
  },
  result: { type: mongoose.Schema.Types.Mixed },
  mitigationPreview: { type: mongoose.Schema.Types.Mixed },
  artifactPaths: { type: mongoose.Schema.Types.Mixed },
});

export const Analysis = mongoose.model('Analysis', AnalysisSchema);
