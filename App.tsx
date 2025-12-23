import React, { useState } from "react"
import { CompletenessProvider, useCompleteness } from "./context/CompletenessContext.tsx"
import { Level } from "./types.ts"
import Sidebar from "./components/Sidebar.tsx"
import CompletenessView from "./components/CompletenessView.tsx"
import AiProcessor from "./components/AiProcessor.tsx"
import SettingsModal from "./components/SettingsModal.tsx"
import CanonViewer from "./components/CanonViewer.tsx"
import CanonModal from "./components/CanonModal.tsx"
import ImagePromptModal from "./components/ImagePromptModal.tsx"
import { Settings, BookOpen, ScrollText, Sparkles } from "lucide-react"

const AppContent: React.FC = () => {
    const [selectedLevel, setSelectedLevel] = useState<Level>("L2")
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isCanonOpen, setIsCanonOpen] = useState(false)
    const [isImageOpen, setIsImageOpen] = useState(false)

    const { extractedContent, isViewerVisible, setIsViewerVisible } = useCompleteness()

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-200">
            <header className="flex items-center justify-between p-4 border-b border-slate-800">
                <h1 className="text-lg font-semibold tracking-wide">Canon Completeness Tracker</h1>

                <div className="flex items-center gap-3">
                    <AiProcessor />

                    {/* Canon editor (moved out of settings) */}
                    <button
                        onClick={() => setIsCanonOpen(true)}
                        className="flex items-center justify-center w-9 h-9 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-colors"
                        aria-label="Open Canon Editor"
                        title="Canon"
                    >
                        <ScrollText size={20} />
                    </button>

                    {/* Image prompt generator */}
                    <button
                        onClick={() => setIsImageOpen(true)}
                        className="flex items-center justify-center w-9 h-9 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-colors"
                        aria-label="Open Image Prompt Generator"
                        title="Image Prompt Generator"
                    >
                        <Sparkles size={20} />
                    </button>

                    {/* Viewer toggle */}
                    <button
                        onClick={() => setIsViewerVisible(!isViewerVisible)}
                        disabled={!extractedContent}
                        className="flex items-center justify-center w-9 h-9 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Toggle Canon Viewer"
                        title="Canon Viewer"
                    >
                        <BookOpen size={20} />
                    </button>

                    {/* Settings */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center justify-center w-9 h-9 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-colors"
                        aria-label="Open Settings"
                        title="Settings"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <Sidebar selectedLevel={selectedLevel} onSelectLevel={setSelectedLevel} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    <CompletenessView level={selectedLevel} />
                </main>
                <CanonViewer />
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <CanonModal isOpen={isCanonOpen} onClose={() => setIsCanonOpen(false)} />
            <ImagePromptModal isOpen={isImageOpen} onClose={() => setIsImageOpen(false)} />
        </div>
    )
}

const App: React.FC = () => {
    return (
        <CompletenessProvider>
            <AppContent />
        </CompletenessProvider>
    )
}

export default App
