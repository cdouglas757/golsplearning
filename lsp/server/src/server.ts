import { createConnection, Diagnostic, DiagnosticSeverity, DidChangeConfigurationNotification, InitializeParams, InitializeResult, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

interface ErrorCheckingSettings {
    maxNumberOfProblems: number;
}

const defaultSettings: ErrorCheckingSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ErrorCheckingSettings = defaultSettings;

const documentSettings: Map<string, Thenable<ErrorCheckingSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <ErrorCheckingSettings>(
            (change.settings.goErrorHandling || defaultSettings)
        );
    }

    documents.all().forEach(validateGoErrorHandling);
});

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
    validateGoErrorHandling(change.document);
});

function getDocumentSettings(resource: string): Thenable<ErrorCheckingSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }

    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'goErrorHandling'
        });
        documentSettings.set(resource, result);
    }

    return result;
}

async function validateGoErrorHandling(textDocument: TextDocument) {
    const settings = await getDocumentSettings(textDocument.uri);

    const text = textDocument.getText();
    const errorPattern = /[a-zA-Z]\, err[a-zA-Z0-9]* :/g;
    let errorMatch: RegExpExecArray | null;
    let errorHandleMatch: RegExpExecArray | null;

    let problems = 0;
    const diagnostics: Diagnostic[] = [];

    
    while ((errorMatch = errorPattern.exec(text)) && problems < settings.maxNumberOfProblems) {
        let errorName = errorMatch[0].match(/err[a-zA-Z0-9]* /);
        
        if(!text.includes("if " + errorName + "!= nil")) {
            problems++;
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: textDocument.positionAt(errorMatch.index),
                    end: textDocument.positionAt(errorMatch.index + errorMatch[0].length)
                },
                message: errorName + ' is defined but never verified.',
                source: 'Go Error Handling'
            };

            diagnostics.push(diagnostic);
        }
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};

documents.listen(connection);

connection.listen();

