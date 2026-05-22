export enum PromptLevel {
	BEGINNER = 'beginner',
	INTERMEDIATE = 'intermediate',
	ADVANCED = 'advanced',
}

export enum PromptCategory {
	ANALYSIS = 'analysis',
	VISUALIZATION = 'visualization',
	EDUCATION = 'education',
	WORKFLOW = 'workflow',
}

export interface PromptMetadata {
	level: PromptLevel;
	category: PromptCategory;
	estimatedTime?: string;
	prerequisites?: string[];
	tags?: string[];
}

export interface PromptDef {
	name: string;
	description: string;
	requiresPrivateApi?: boolean;
	messages: Array<{
		role: 'system' | 'assistant' | 'user';
		content: Array<{ type: string; text: string }>;
	}>;
	arguments?: Array<{ name: string; description?: string; required?: boolean }>;
	metadata?: PromptMetadata;
}
