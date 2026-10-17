/** Why a stuck story is stuck and which action moves it, in plain words. Built in c-308. */
export interface StuckExplanation {
  kind: 'broken' | 'shipped' | 'changed' | 'unchanged';
  step: string;
  at?: string;
  /** Whether any work was tried at this step. */
  tried: string;
  /** What already shipped under the story's id. */
  shipped: string;
  /** The one action that changes the outcome; the summary's "what you must do" line. */
  action: string;
  buttons: ('move' | 'retry')[];
  moveTo?: string;
  /** The raw check output, kept apart from the sentences. */
  error?: string;
}
