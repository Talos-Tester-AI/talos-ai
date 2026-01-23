export interface CurrentProject {
    id: string;
    path: string;
}

let currentProject: CurrentProject | null = null;

export const setProject = (project: CurrentProject | null) => {
    currentProject = project;
};

export const getProject = () => {
    return currentProject;
};
