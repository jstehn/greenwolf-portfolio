import resumeEverything from './resumes/everything.json';
import resumeDefault from './resumes/general.json';
import resumeDE from './resumes/data-engineer.json';
import resumeDS from './resumes/data-scientist.json';
import resumeMLE from './resumes/ml-engineer.json';
import resumeSWE from './resumes/software-engineer.json';

export interface ResumeDraft {
    id: string;
    label: string;
    data: typeof resumeEverything;
    // Hidden drafts still get a PDF built, but don't appear as tabs on /resume
    hidden?: boolean;
}

export const drafts: ResumeDraft[] = [
    { id: 'data-engineer', label: 'Data & Analytics Engineer', data: resumeDE as typeof resumeEverything },
    { id: 'data-scientist', label: 'Data Scientist', data: resumeDS as typeof resumeEverything },
    { id: 'general', label: 'General', data: resumeDefault as typeof resumeEverything, hidden: true },
    { id: 'everything', label: 'Everything', data: resumeEverything, hidden: true },
    { id: 'ml-engineer', label: 'ML Engineer', data: resumeMLE as typeof resumeEverything, hidden: true },
    { id: 'software-engineer', label: 'Software Engineer', data: resumeSWE as typeof resumeEverything, hidden: true },
];

export const visibleDrafts = drafts.filter((d) => !d.hidden);

export const defaultDraftId = 'data-engineer';
