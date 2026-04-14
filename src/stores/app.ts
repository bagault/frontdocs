import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { MarkdownFile, FileContent, FileTreeNode, BuildResult } from '../types';

export const useAppStore = defineStore('app', () => {
  const workspacePath = ref<string | null>(null);
  const files = ref<MarkdownFile[]>([]);
  const fileTree = ref<FileTreeNode | null>(null);
  const currentFile = ref<FileContent | null>(null);
  const isLoading = ref(false);
  const buildProgress = ref(0);
  const buildOutput = ref<BuildResult | null>(null);
  const sideNavOpen = ref(true);
  const aiPanelOpen = ref(false);
  const snackbar = ref({ show: false, text: '', color: 'success' });
  const undoStack = ref<{ path: string; content: string }[]>([]);

  const buildLog = ref<string[]>([]);
  const isBuildDialogOpen = ref(false);

  const hasWorkspace = computed(() => workspacePath.value !== null);

  function showMessage(text: string, color = 'success') {
    snackbar.value = { show: true, text, color };
  }

  async function openFolder(path: string) {
    isLoading.value = true;
    try {
      const projectType = await invoke<string>('detect_project_type', { folderPath: path });
      isProject.value = projectType === 'project';
      workspacePath.value = path;
      const result = await invoke<MarkdownFile[]>('list_markdown_files', {
        folderPath: path,
      });
      files.value = result;
      const tree = await invoke<FileTreeNode>('get_file_tree', {
        folderPath: path,
      });
      fileTree.value = tree;
    } catch (e: any) {
      showMessage(e.toString(), 'error');
    } finally {
      isLoading.value = false;
    }
  }

  async function openFile(filePath: string) {
    isLoading.value = true;
    try {
      currentFile.value = await invoke<FileContent>('read_markdown_file', {
        filePath,
      });
    } catch (e: any) {
      showMessage(e.toString(), 'error');
    } finally {
      isLoading.value = false;
    }
  }

  async function saveCurrentFile() {
    if (!currentFile.value) return;
    try {
      await invoke('save_markdown_file', {
        filePath: currentFile.value.path,
        content: currentFile.value.content,
      });
      showMessage('File saved');
    } catch (e: any) {
      showMessage(e.toString(), 'error');
    }
  }

  async function createFile(fileName: string, content: string) {
    if (!workspacePath.value) return;
    try {
      const path = await invoke<string>('create_markdown_file', {
        folderPath: workspacePath.value,
        fileName,
        content,
      });
      await openFolder(workspacePath.value);
      await openFile(path);
      showMessage('File created');
    } catch (e: any) {
      showMessage(e.toString(), 'error');
    }
  }

  const isProject = ref(false);

  async function buildAndExport(format: string, outputPath?: string) {
    if (!workspacePath.value) return;
    isLoading.value = true;
    buildProgress.value = 0;
    buildLog.value = [];
    isBuildDialogOpen.value = true;
    try {
      // For project workspaces, default output to dist/ inside the project
      if (!outputPath && isProject.value) {
        outputPath = workspacePath.value.replace(/[\\/]+$/, '') + '/dist';
      }

      // Use a temp dir for the intermediate mkdocs build
      const buildOutputDir = workspacePath.value + '_build';

      buildLog.value.push('Starting mkdocs build...');
      buildProgress.value = 5;

      // Slow logarithmic progress simulation during mkdocs build
      let tick = 0;
      const progressInterval = setInterval(() => {
        tick++;
        // Logarithmic curve: fast start, slow finish. Caps at ~70%
        const target = Math.min(70, 15 * Math.log(tick + 1));
        if (buildProgress.value < target) {
          buildProgress.value = Math.round(target);
        }
        // Add periodic log entries
        if (tick === 3) buildLog.value.push('Processing content files...');
        if (tick === 8) buildLog.value.push('Generating navigation...');
        if (tick === 14) buildLog.value.push('Building search index...');
        if (tick === 20) buildLog.value.push('Rendering pages...');
      }, 500);

      buildOutput.value = await invoke<BuildResult>('build_site', {
        sourceFolder: workspacePath.value,
        outputFolder: buildOutputDir,
      });

      clearInterval(progressInterval);

      if (!buildOutput.value.success) {
        buildProgress.value = 100;
        const errors = buildOutput.value.stderr || 'Unknown error';
        buildLog.value.push(`Build failed: ${errors}`);
        showMessage('Build failed: ' + errors, 'error');
        // Clean up intermediate build dir on failure
        try { await invoke('remove_dir', { path: buildOutputDir }); } catch {}
        return;
      }

      buildProgress.value = 75;
      buildLog.value.push('Build complete. Exporting...');

      // Export step
      try {
        const result = await invoke<string>('export_site', {
          sourcePath: buildOutputDir,
          outputFormat: format,
          outputPath: outputPath || null,
        });
        buildProgress.value = 100;
        buildLog.value.push(`Exported to: ${result}`);
        showMessage('Build & export complete');
      } catch (e: any) {
        buildProgress.value = 100;
        buildLog.value.push(`Export failed: ${e}`);
        showMessage(e.toString(), 'error');
      }

      // Clean up intermediate _site build directory
      try { await invoke('remove_dir', { path: buildOutputDir }); } catch {}
    } catch (e: any) {
      buildProgress.value = 100;
      buildLog.value.push(`Error: ${e}`);
      showMessage(e.toString(), 'error');
    } finally {
      isLoading.value = false;
    }
  }

  function closeWorkspace() {
    workspacePath.value = null;
    files.value = [];
    fileTree.value = null;
    currentFile.value = null;
    buildOutput.value = null;
    undoStack.value = [];
  }

  function pushUndo() {
    if (currentFile.value) {
      undoStack.value.push({
        path: currentFile.value.path,
        content: currentFile.value.content,
      });
      // Cap at 50 entries
      if (undoStack.value.length > 50) {
        undoStack.value.shift();
      }
    }
  }

  function undo() {
    if (undoStack.value.length === 0 || !currentFile.value) return;
    const last = undoStack.value.pop()!;
    if (last.path === currentFile.value.path) {
      currentFile.value.content = last.content;
    }
  }

  const canUndo = computed(() => {
    return undoStack.value.length > 0 && currentFile.value !== null;
  });

  return {
    workspacePath,
    files,
    fileTree,
    currentFile,
    isLoading,
    buildProgress,
    buildOutput,
    buildLog,
    isBuildDialogOpen,
    isProject,
    sideNavOpen,
    aiPanelOpen,
    snackbar,
    undoStack,
    hasWorkspace,
    canUndo,
    showMessage,
    openFolder,
    openFile,
    saveCurrentFile,
    createFile,
    buildAndExport,
    closeWorkspace,
    pushUndo,
    undo,
  };
});
