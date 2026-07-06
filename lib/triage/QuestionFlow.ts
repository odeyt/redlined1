/**
 * Automotive Triage Engine — Question Flow
 * Manages which questions are active, handles branching conditions,
 * and tracks completion state.
 */

import { Question, AnswerMap, CategoryId, QuestionCondition } from './QuestionTypes';
import { QUESTION_REGISTRY } from './QuestionRepository';

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(condition: QuestionCondition, answers: AnswerMap): boolean {
  const answer = answers[condition.questionId];

  switch (condition.operator) {
    case 'eq':
      return String(answer) === condition.value;
    case 'neq':
      return String(answer) !== condition.value;
    case 'includes':
      if (Array.isArray(answer)) return answer.includes(condition.value ?? '');
      return String(answer).includes(condition.value ?? '');
    case 'truthy':
      return answer === true || answer === 'yes' || (typeof answer === 'number' && answer > 0);
    default:
      return true;
  }
}

// ─── QuestionFlow ─────────────────────────────────────────────────────────────

export class QuestionFlow {
  private categoryId: CategoryId;
  private allQuestions: Question[];

  constructor(categoryId: CategoryId) {
    this.categoryId = categoryId;
    this.allQuestions = QUESTION_REGISTRY[categoryId] ?? [];
  }

  /**
   * Returns the ordered list of questions that should be shown
   * given the current answer state.
   */
  getActiveQuestions(answers: AnswerMap): Question[] {
    return this.allQuestions.filter(q => {
      if (!q.showIf) return true;
      return evaluateCondition(q.showIf, answers);
    });
  }

  /**
   * Returns ids of required questions that have not been answered.
   */
  getMissingRequired(answers: AnswerMap): string[] {
    const active = this.getActiveQuestions(answers);
    return active
      .filter(q => q.required)
      .filter(q => {
        const a = answers[q.id];
        return a === undefined || a === null || a === '' ||
          (Array.isArray(a) && a.length === 0);
      })
      .map(q => q.id);
  }

  /**
   * Returns count of answered questions out of total active.
   */
  getProgress(answers: AnswerMap): { answered: number; total: number } {
    const active = this.getActiveQuestions(answers);
    const answered = active.filter(q => {
      const a = answers[q.id];
      return a !== undefined && a !== null && a !== '' &&
        !(Array.isArray(a) && a.length === 0);
    }).length;
    return { answered, total: active.length };
  }

  /**
   * Returns the question definition for a given id.
   */
  getQuestion(id: string): Question | undefined {
    return this.allQuestions.find(q => q.id === id);
  }

  getCategoryId(): CategoryId {
    return this.categoryId;
  }

  getAllQuestions(): Question[] {
    return this.allQuestions;
  }
}
