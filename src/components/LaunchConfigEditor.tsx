import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { Plus, X, Lock, Unlock, Code, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { SCHEMAS } from '../pages/schemas';
import { Input } from './Input';
import { Button } from './Button';

type RunnerType = 'dart' | 'chrome' | 'node' | 'docker' | string;

export interface LaunchConfig {
    _id?: string;
    name: string;
    type: RunnerType;
    request: 'launch' | 'attach';
    program: string;
    cwd?: string;
    args: string[];
    env: Record<string, string>;
    options: Record<string, any>;
}

interface LaunchConfigEditorProps {
    config: LaunchConfig;
    onChange: (config: LaunchConfig) => void;
}

export const LaunchConfigEditor: React.FC<LaunchConfigEditorProps> = ({ config, onChange }) => {
    const [tagInput, setTagInput] = useState('');
    const [isJsonMode, setIsJsonMode] = useState(false);
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Local state for Environment Key-Value pairs to handle UI edits
    // This derived state needs to stay in sync with props.
    const [envPairs, setEnvPairs] = useState<{ key: string; value: string; isLocked: boolean }[]>([]);

    // Initialize env pairs from config prop
    useEffect(() => {
        if (config.env) {
            // Check if we need to update envPairs to avoid loop if coming from internal update
            // But since this is a UI projection, strictly deriving is safer.
            // Improve: Only update if structurally different to prevent cursor jumps?
            // For now, let's derive. If inputs lose focus, we can optimize.
            const pairs = Object.entries(config.env).map(([key, value]) => ({
                key,
                value,
                isLocked: value.startsWith('${{') && value.endsWith('}}')
            }));

            // Simple optimization: verify length or json stringify to avoid unnecessary state updates
            setEnvPairs(prev => {
                if (JSON.stringify(prev) === JSON.stringify(pairs)) return prev;
                return pairs;
            });
        }
    }, [config.env]);

    const handleInputChange = (field: keyof LaunchConfig, value: any) => {
        console.log(`[Editor] Field change: ${field} = ${value}`);
        onChange({ ...config, [field]: value });
    };

    // --- Args (Chip Input) Logic ---
    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (!config.args.includes(tagInput.trim())) {
                const newArgs = [...config.args, tagInput.trim()];
                onChange({ ...config, args: newArgs });
            }
            setTagInput('');
        }
    };

    const removeTag = (tag: string) => {
        const newArgs = config.args.filter(t => t !== tag);
        onChange({ ...config, args: newArgs });
    };

    // --- Env (Key-Value) Logic ---
    // Helper to sync
    const syncEnvToConfig = (pairs: typeof envPairs) => {
        const envRecord: Record<string, string> = {};
        pairs.forEach(p => {
            if (p.key) envRecord[p.key] = p.value;
        });
        onChange({ ...config, env: envRecord });
    };

    const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
        const newPairs = [...envPairs];
        newPairs[index] = { ...newPairs[index], [field]: val };
        setEnvPairs(newPairs); // Optimistic UI update
        syncEnvToConfig(newPairs);
    };

    const toggleLock = (index: number) => {
        const newPairs = [...envPairs];
        const pair = newPairs[index];

        if (pair.isLocked) {
            if (pair.value.startsWith('${{ ') && pair.value.endsWith(' }}')) {
                pair.value = pair.value.slice(4, -3);
            }
        } else {
            pair.value = `\${{ SECRETS.${pair.value.toUpperCase().replace(/[^A-Z0-9_]/g, '')} }}`;
        }

        pair.isLocked = !pair.isLocked;
        newPairs[index] = pair;
        setEnvPairs(newPairs);
        syncEnvToConfig(newPairs);
    };

    const addEnvRow = () => {
        const newPairs = [...envPairs, { key: '', value: '', isLocked: false }];
        setEnvPairs(newPairs);
        // Do NOT sync immediately if empty to keep clean config? 
        // Or sync immediately? Let's sync to keep state consistent.
        syncEnvToConfig(newPairs);
    };

    const removeEnvRow = (index: number) => {
        const newPairs = envPairs.filter((_, i) => i !== index);
        setEnvPairs(newPairs);
        syncEnvToConfig(newPairs);
    };

    // --- Options (Visual/JSON) Logic ---
    const handleOptionsChange = (data: any) => {
        const newOptions = data.formData || data;
        onChange({ ...config, options: newOptions });
    };

    const handleJsonEditorChange = (value: string | undefined) => {
        if (!value) return;
        try {
            const parsed = JSON.parse(value);
            onChange({ ...config, options: parsed });
            setJsonError(null);
        } catch (e: any) {
            setJsonError(e.message);
        }
    };

    const currentSchema = SCHEMAS[config.type as keyof typeof SCHEMAS] || SCHEMAS.default;

    return (
        <div className="space-y-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">

            {/* SECTION 1: Core Configuration */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <Input
                    label="Configuration Name"
                    value={config.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., Debug Production"
                />

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Runner Type</label>
                    <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={config.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                    >
                        {Object.keys(SCHEMAS).filter(k => k !== 'default').map(type => (
                            <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg w-max">
                        <button
                            type="button"
                            onClick={() => handleInputChange('request', 'launch')}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                config.request === 'launch' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <Play size={14} className="inline mr-2" /> Launch
                        </button>
                        <button
                            type="button"
                            onClick={() => handleInputChange('request', 'attach')}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                config.request === 'attach' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <div className="flex items-center gap-2">Attach</div>
                        </button>
                    </div>
                </div>

                <div className="relative z-10">
                    <Input
                        label="Program / Entry Point"
                        value={config.program}
                        onChange={(e) => {
                            console.log('[Editor] PROGRAM INPUT RAW ONCHANGE:', e.target.value);
                            handleInputChange('program', e.target.value);
                        }}
                        placeholder="e.g., src/index.ts"
                    />
                </div>

                <Input
                    label="Working Directory"
                    value={config.cwd || ''}
                    onChange={(e) => handleInputChange('cwd', e.target.value)}
                    placeholder="e.g., ${workspaceFolder}"
                />
            </section>


            {/* SECTION 2: Arguments & Environment */}
            <section className="space-y-6 pb-6 border-b border-gray-100">

                {/* Args */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Build Arguments</label>
                    <div className="border border-gray-300 rounded-lg p-3 focus-within:ring-2 focus-within:ring-blue-500 bg-gray-50/50">
                        <div className="flex flex-wrap gap-2 mb-2">
                            {config.args.map(tag => (
                                <span key={tag} className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-sm">
                                    {tag}
                                    <button onClick={() => removeTag(tag)} className="ml-1 hover:text-blue-900"><X size={14} /></button>
                                </span>
                            ))}
                        </div>
                        <input
                            className="w-full bg-transparent outline-none text-sm"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder="Type argument and hit Enter..."
                        />
                    </div>
                </div>

                {/* Env */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">Environment Variables</label>
                        <Button size="sm" variant="secondary" onClick={addEnvRow} type="button">
                            <Plus size={14} className="mr-1" /> Add Variable
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {envPairs.map((pair, idx) => (
                            <div key={idx} className="flex gap-2 items-center group">
                                <input
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono placeholder:text-gray-400"
                                    placeholder="KEY"
                                    value={pair.key}
                                    onChange={(e) => handleEnvChange(idx, 'key', e.target.value)}
                                />
                                <div className="flex-[2] relative">
                                    <input
                                        className={clsx(
                                            "w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono placeholder:text-gray-400",
                                            pair.isLocked && "text-gray-500 bg-gray-50 border-gray-200"
                                        )}
                                        placeholder="VALUE"
                                        value={pair.value}
                                        onChange={(e) => handleEnvChange(idx, 'value', e.target.value)}
                                        readOnly={pair.isLocked}
                                    />
                                    <button
                                        onClick={() => toggleLock(idx)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        type="button"
                                    >
                                        {pair.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeEnvRow(idx)}
                                    className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    type="button"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {envPairs.length === 0 && (
                            <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
                                No environment variables defined
                            </div>
                        )}
                    </div>
                </div>
            </section>


            {/* SECTION 3: Dynamic Options */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">Runner Options</h3>
                        <span className="px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                            {config.type}
                        </span>
                    </div>

                    <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setIsJsonMode(false)}
                            className={clsx(
                                "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all",
                                !isJsonMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Visual Map
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsJsonMode(true)}
                            className={clsx(
                                "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all",
                                isJsonMode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <Code size={14} /> JSON
                        </button>
                    </div>
                </div>

                <div className={clsx("rounded-xl border shadow-inner min-h-[300px]", isJsonMode ? "bg-[#1e1e1e] border-gray-800" : "bg-gray-50 border-gray-200 p-4")}>
                    {isJsonMode ? (
                        <div className="relative pt-4">
                            {jsonError && (
                                <div className="absolute top-0 right-0 left-0 bg-red-500 text-white text-xs px-2 py-1 text-center z-10">
                                    Invalid JSON: {jsonError}
                                </div>
                            )}
                            <Editor
                                height="300px"
                                defaultLanguage="json"
                                value={JSON.stringify(config.options, null, 2)}
                                onChange={handleJsonEditorChange}
                                theme="vs-dark"
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    lineNumbers: 'off',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true
                                }}
                            />
                        </div>
                    ) : (
                        <div className="rjsf-clean-theme">
                            <Form
                                schema={currentSchema as any}
                                formData={config.options}
                                onChange={handleOptionsChange}
                                validator={validator}
                                children={true} // Hide default submit button
                                uiSchema={{
                                    "ui:submitButtonOptions": { norender: true }
                                }}
                            />
                        </div>
                    )}
                </div>
            </section>

        </div>
    );
};
