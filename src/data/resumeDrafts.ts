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
}

export const drafts: ResumeDraft[] = [
    { id: 'general', label: 'General', data: resumeDefault as typeof resumeEverything },
    { id: 'everything', label: 'Everything', data: resumeEverything },
    { id: 'data-engineer', label: 'Data Engineer', data: resumeDE as typeof resumeEverything },
    { id: 'data-scientist', label: 'Data Scientist', data: resumeDS as typeof resumeEverything },
    { id: 'ml-engineer', label: 'ML Engineer', data: resumeMLE as typeof resumeEverything },
    { id: 'software-engineer', label: 'Software Engineer', data: resumeSWE as typeof resumeEverything },
];

export const defaultDraftId = 'general';
