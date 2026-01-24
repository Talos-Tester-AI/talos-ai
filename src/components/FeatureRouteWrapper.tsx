import { useEffect } from 'react';
import { useParams, Outlet } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProject } from '../store/slices/projectSlice';

/**
 * Wrapper component for feature routes that automatically loads the parent project into Redux.
 * Finds the project by looking up the feature in Redux, or loads all known projects to find it.
 */
export const FeatureRouteWrapper = () => {
    const { id } = useParams<{ id: string }>();
    const dispatch = useAppDispatch();
    const { currentProject, features, loading } = useAppSelector((state) => state.project);

    useEffect(() => {
        // Guard against invalid IDs
        if (!id || id === 'undefined' || id.trim() === '') {
            console.warn('[FeatureRouteWrapper] Invalid feature ID:', id);
            return;
        }

        // Check if feature is already in Redux
        const feature = features.find(f => f._id === id);
        
        if (feature?.projectId) {
            // Feature found in Redux - check if we need to load its project
            if (!currentProject || currentProject._id !== feature.projectId) {
                console.log('[FeatureRouteWrapper] Loading project from Redux feature:', feature.projectId);
                dispatch(fetchProject(feature.projectId));
            }
        } else {
            // Feature NOT in Redux - need to find which project it belongs to
            // This happens when navigating directly to a feature URL
            console.log('[FeatureRouteWrapper] Feature not in Redux, searching via backend:', id);
            
            // The backend handlers already search all projects for the feature
            // So we just need to trigger a feature fetch which will set the project
            // Then we can load that project into Redux
            import('../api/client').then(({ getFeature }) => {
                getFeature(id).then(featureRes => {
                    const foundFeature = featureRes.data;
                    if (foundFeature?.projectId) {
                        console.log('[FeatureRouteWrapper] Found feature, loading project into Redux:', foundFeature.projectId);
                        dispatch(fetchProject(foundFeature.projectId));
                    }
                }).catch(err => {
                    console.error('[FeatureRouteWrapper] Failed to find feature:', err);
                });
            });
        }
    }, [id, dispatch, currentProject, features]);

    // Show loading state while initial project loads
    if (loading && !currentProject) {
        return <div className="text-center py-12">Loading...</div>;
    }

    return <Outlet />;
};

