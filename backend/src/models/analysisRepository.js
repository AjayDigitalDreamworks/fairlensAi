import { Analysis } from './Analysis.js';

export class AnalysisRepository {
  async list() {
    try {
      const list = await Analysis.find({}, {
        'result.explanation': 0,
        'result.explainability': 0,
        'result.report_markdown': 0,
        'result.analysis_log': 0,
        'result.corrected_csv': 0,
        'result.sensitive_findings.notes': 0,
        'result.intersectional_findings.group_metrics': 0,
        'result.intersectional_findings.notes': 0,
        'result.artifacts.corrected_csv': 0,
        'result.artifacts.fairness_report_markdown': 0,
        'result.artifacts.pdf_report_path': 0,
        'artifactPaths': 0
      })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean()
      .maxTimeMS(2500);
      return list;
    } catch (err) {
      console.error('Mongoose list error:', err.message);
      return [];
    }
  }

  async getById(id) {
    try {
      const doc = await Analysis.findOne({ id }).lean().maxTimeMS(5000);
      return doc;
    } catch (err) {
      console.error(`Mongoose getById(${id}) error:`, err.message);
      return null;
    }
  }

  async save(analysis) {
    try {
      const doc = await Analysis.findOneAndUpdate(
        { id: analysis.id },
        { $set: analysis },
        { new: true, upsert: true, maxTimeMS: 5000 }
      ).lean();
      return doc;
    } catch (err) {
      console.error('Mongoose save error:', err.message);
      return analysis;
    }
  }

  async deleteById(id) {
    try {
      const doc = await Analysis.findOneAndDelete({ id }).lean().maxTimeMS(5000);
      return doc;
    } catch (err) {
      console.error(`Mongoose deleteById(${id}) error:`, err.message);
      return null;
    }
  }
}
