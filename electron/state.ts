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


let serverPort: number | null = null;

export const setServerPort = (port: number) => {
    serverPort = port;
};

export const getServerPort = () => {
    return serverPort;
};
