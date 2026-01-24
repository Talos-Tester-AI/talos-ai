import fs from 'fs-extra';
import path from 'node:path';
import ignore, { Ignore } from 'ignore';

// Common directories to ignore when scanning projects
const DEFAULT_IGNORE_PATTERNS = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '.output',
    'coverage',
    '.cache',
    '.idea',
    '.vscode',
    '__pycache__',
    '*.pyc',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.env',
    '.env.*',
    '*.min.js',
    '*.min.css',
    '*.map',
    '*.d.ts',
    'test',
    'tests',
    '__tests__',
    'spec',
    'specs',
    '*.test.*',
    '*.spec.*',
    'android/app/build',
    'ios/Pods',
    'ios/build',
    '.gradle',
    'gradle',
    '.dart_tool',
    '.flutter-plugins',
    '.flutter-plugins-dependencies',
];

// File extensions we're interested in for different project types
const RELEVANT_EXTENSIONS: Record<string, string[]> = {
    web: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss', '.sass', '.less'],
    mobile: ['.java', '.kt', '.swift', '.m', '.dart', '.tsx', '.jsx'],
    config: ['.json', '.yaml', '.yml', '.xml', '.gradle', '.plist'],
    documentation: ['.md', '.txt', '.rst'],
};

export interface ScannedFile {
    relativePath: string;
    absolutePath: string;
    extension: string;
    size: number;
}

export interface ScanResult {
    files: ScannedFile[];
    totalFiles: number;
    totalSize: number;
    projectType: 'web' | 'mobile' | 'flutter' | 'react-native' | 'unknown';
}

/**
 * Load .gitignore patterns from a directory
 */
async function loadGitignore(projectPath: string): Promise<Ignore> {
    const ig = ignore();
    
    // Add default patterns
    ig.add(DEFAULT_IGNORE_PATTERNS);
    
    // Try to load .gitignore
    const gitignorePath = path.join(projectPath, '.gitignore');
    try {
        if (await fs.pathExists(gitignorePath)) {
            const content = await fs.readFile(gitignorePath, 'utf-8');
            ig.add(content.split('\n').filter(line => line.trim() && !line.startsWith('#')));
        }
    } catch (e) {
        // Ignore errors reading .gitignore
    }
    
    return ig;
}

/**
 * Detect the project type based on files present
 */
async function detectProjectType(projectPath: string): Promise<ScanResult['projectType']> {
    const checks = {
        flutter: ['pubspec.yaml', 'lib/main.dart'],
        'react-native': ['app.json', 'metro.config.js', 'react-native.config.js'],
        web: ['package.json', 'index.html', 'vite.config.js', 'webpack.config.js', 'next.config.js'],
        mobile: ['AndroidManifest.xml', 'Info.plist', 'build.gradle'],
    };

    for (const [type, files] of Object.entries(checks)) {
        for (const file of files) {
            const filePath = path.join(projectPath, file);
            if (await fs.pathExists(filePath)) {
                return type as ScanResult['projectType'];
            }
            // Check in subdirectories for mobile
            if (type === 'mobile' || type === 'flutter') {
                const subDirs = ['android', 'ios', 'app', 'lib'];
                for (const subDir of subDirs) {
                    const subPath = path.join(projectPath, subDir, file);
                    if (await fs.pathExists(subPath)) {
                        return type as ScanResult['projectType'];
                    }
                }
            }
        }
    }

    return 'unknown';
}

/**
 * Get relevant extensions based on project type
 */
function getRelevantExtensions(projectType: ScanResult['projectType']): string[] {
    const extensions = new Set<string>();
    
    // Always include config files
    RELEVANT_EXTENSIONS.config.forEach(ext => extensions.add(ext));
    
    switch (projectType) {
        case 'flutter':
            extensions.add('.dart');
            extensions.add('.yaml');
            break;
        case 'react-native':
            RELEVANT_EXTENSIONS.web.forEach(ext => extensions.add(ext));
            RELEVANT_EXTENSIONS.mobile.forEach(ext => extensions.add(ext));
            break;
        case 'mobile':
            RELEVANT_EXTENSIONS.mobile.forEach(ext => extensions.add(ext));
            break;
        case 'web':
        default:
            RELEVANT_EXTENSIONS.web.forEach(ext => extensions.add(ext));
            break;
    }
    
    return Array.from(extensions);
}

/**
 * Recursively scan a directory for source files
 */
async function scanDirectory(
    dirPath: string,
    basePath: string,
    ig: Ignore,
    relevantExtensions: string[],
    files: ScannedFile[],
    maxFiles: number = 500,
    maxDepth: number = 10,
    currentDepth: number = 0
): Promise<void> {
    if (currentDepth > maxDepth || files.length >= maxFiles) {
        return;
    }

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (files.length >= maxFiles) break;
            
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(basePath, fullPath);
            
            // Check if ignored
            if (ig.ignores(relativePath)) {
                continue;
            }
            
            if (entry.isDirectory()) {
                await scanDirectory(fullPath, basePath, ig, relevantExtensions, files, maxFiles, maxDepth, currentDepth + 1);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                
                // Include if it's a relevant extension or a key config file
                const isRelevant = relevantExtensions.includes(ext) ||
                    entry.name === 'package.json' ||
                    entry.name === 'pubspec.yaml' ||
                    entry.name === 'README.md' ||
                    entry.name === 'Dockerfile';
                
                if (isRelevant) {
                    try {
                        const stats = await fs.stat(fullPath);
                        // Skip files larger than 100KB to avoid huge files
                        if (stats.size <= 100 * 1024) {
                            files.push({
                                relativePath,
                                absolutePath: fullPath,
                                extension: ext,
                                size: stats.size,
                            });
                        }
                    } catch (e) {
                        // Skip files we can't stat
                    }
                }
            }
        }
    } catch (e) {
        // Skip directories we can't read
        console.error(`Error scanning directory ${dirPath}:`, e);
    }
}

/**
 * Discover project files for analysis
 */
export async function discoverProjectFiles(projectPath: string): Promise<ScanResult> {
    // Detect project type
    const projectType = await detectProjectType(projectPath);
    console.log(`[file-scanner] Detected project type: ${projectType}`);
    
    // Load ignore patterns
    const ig = await loadGitignore(projectPath);
    
    // Get relevant extensions
    const relevantExtensions = getRelevantExtensions(projectType);
    console.log(`[file-scanner] Looking for extensions: ${relevantExtensions.join(', ')}`);
    
    // Scan files
    const files: ScannedFile[] = [];
    await scanDirectory(projectPath, projectPath, ig, relevantExtensions, files);
    
    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    console.log(`[file-scanner] Found ${files.length} files, total size: ${(totalSize / 1024).toFixed(2)} KB`);
    
    return {
        files,
        totalFiles: files.length,
        totalSize,
        projectType,
    };
}

/**
 * Read file contents with size limit
 */
export async function readFileContent(filePath: string, maxSize: number = 50 * 1024): Promise<string | null> {
    try {
        const stats = await fs.stat(filePath);
        if (stats.size > maxSize) {
            return null;
        }
        return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
        console.error(`[file-scanner] Error reading file ${filePath}:`, e);
        return null;
    }
}

/**
 * Read multiple files and build a context string
 */
export async function readProjectContext(
    files: ScannedFile[],
    maxTotalSize: number = 500 * 1024 // 500KB total context limit
): Promise<{ context: string; filesRead: number; truncated: boolean }> {
    let context = '';
    let currentSize = 0;
    let filesRead = 0;
    let truncated = false;
    
    // Prioritize certain files (package.json, main entry points, etc.)
    const priorityPatterns = [
        /package\.json$/,
        /pubspec\.yaml$/,
        /app\.json$/,
        /README\.md$/i,
        /main\.(ts|tsx|js|jsx|dart)$/,
        /App\.(ts|tsx|js|jsx)$/,
        /index\.(ts|tsx|js|jsx|html)$/,
    ];
    
    const sortedFiles = [...files].sort((a, b) => {
        const aPriority = priorityPatterns.findIndex(p => p.test(a.relativePath));
        const bPriority = priorityPatterns.findIndex(p => p.test(b.relativePath));
        
        if (aPriority !== -1 && bPriority === -1) return -1;
        if (aPriority === -1 && bPriority !== -1) return 1;
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        
        // Otherwise sort by size (smaller first)
        return a.size - b.size;
    });
    
    for (const file of sortedFiles) {
        if (currentSize + file.size > maxTotalSize) {
            truncated = true;
            continue;
        }
        
        const content = await readFileContent(file.absolutePath);
        if (content !== null) {
            context += `\n\n--- FILE: ${file.relativePath} ---\n${content}`;
            currentSize += content.length;
            filesRead++;
        }
    }
    
    return { context, filesRead, truncated };
}

