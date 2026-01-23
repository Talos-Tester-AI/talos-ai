export const SCHEMAS = {
    dart: {
        type: "object",
        properties: {
            deviceId: { type: "string", title: "Device ID", description: "Target device ID (e.g. emulator-5554)" },
            flutterMode: { type: "string", enum: ["debug", "profile", "release"], default: "debug", title: "Flutter Mode" },
            observatoryUri: { type: "string", title: "Observatory URI" },
            args: { type: "array", items: { type: "string" }, title: "Additional Args" }
        }
    },
    chrome: {
        type: "object",
        properties: {
            url: { type: "string", title: "URL", default: "http://localhost:3000" },
            webRoot: { type: "string", title: "Web Root", default: "${workspaceFolder}" },
            headless: { type: "boolean", title: "Headless Mode", default: false },
            viewport: {
                type: "object",
                title: "Viewport",
                properties: {
                    width: { type: "number", default: 1280 },
                    height: { type: "number", default: 720 }
                }
            }
        }
    },
    node: {
        type: "object",
        properties: {
            runtimeExecutable: { type: "string", title: "Runtime Executable" },
            runtimeArgs: { type: "array", items: { type: "string" }, title: "Runtime Args" },
            stopOnEntry: { type: "boolean", title: "Stop On Entry", default: false },
            console: { type: "string", enum: ["internalConsole", "integratedTerminal", "externalTerminal"], default: "internalConsole", title: "Console" }
        }
    },
    docker: {
        type: "object",
        properties: {
            image: { type: "string", title: "Image" },
            containerName: { type: "string", title: "Container Name" },
            ports: { type: "array", items: { type: "string" }, title: "Ports" },
            volumes: { type: "array", items: { type: "string" }, title: "Volumes" }
        }
    },
    // Default fallback
    default: {
        type: "object",
        properties: {
            host: { type: "string", title: "Host" },
            port: { type: "number", title: "Port" }
        }
    }
};
