export interface CurrentProject {
    id: string;
    path: string;
}

import Store from 'electron-store';

interface StateStore {
    currentProject: CurrentProject | null;
}

const store = new Store<StateStore>({
    name: 'talos-state',
    defaults: {
        currentProject: null
    }
});

let currentProject: CurrentProject | null = store.get('currentProject');

export const setProject = (project: CurrentProject | null) => {
    currentProject = project;
    store.set('currentProject', project);
    if (project) {
        console.log(`[state] Project persisted: ${project.path}`);
    } else {
        console.log('[state] Project cleared');
    }
};

export const getProject = () => {
    if (!currentProject) {
        currentProject = store.get('currentProject');
    }
    return currentProject;
};


let serverPort: number | null = null;

export const setServerPort = (port: number) => {
    serverPort = port;
};

export const getServerPort = () => {
    return serverPort;
};
