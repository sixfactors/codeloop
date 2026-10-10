import { migrateStories } from '../../story.js';
import type { Migration } from './index.js';

/** Fills the story fields on proposals that were written as one-line descriptions before the fields existed. */
export const storyFields: Migration = {
  id: '001-story-fields',
  up: ({ projectDir }) => {
    const changed = migrateStories(projectDir);
    return changed.length ? `story fields filled on ${changed.join(', ')}` : 'nothing to fill';
  },
};
