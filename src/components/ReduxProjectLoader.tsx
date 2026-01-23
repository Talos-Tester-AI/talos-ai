import { useEffect } from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProject } from '../store/slices/projectSlice';

export const ReduxProjectLoader = () => {
    const { id } = useParams<{ id: string }>();
    const dispatch = useAppDispatch();
    const { currentProject, loading, error } = useAppSelector((state) => state.project);

    useEffect(() => {
        if (id && (!currentProject || currentProject._id !== id)) {
            dispatch(fetchProject(id));
        }
    }, [id, dispatch, currentProject]);

    // Optional: render loading/error states here or let children handle it
    // For now, let's just render Outlet. 
    // Ideally we might want to show a spinner if loading initial project.

    // If we are loading and have NO project, show loading.
    if (loading && !currentProject) {
        return <div className="text-center py-12">Loading Project...</div>;
    }

    if (error) {
        return <div className="text-center py-12 text-red-600">Error: {error}</div>;
    }

    return <Outlet />;
};
