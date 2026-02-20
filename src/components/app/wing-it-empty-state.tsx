import React from 'react';
import { ArrowRight } from 'lucide-react';

interface WingItEmptyStateProps {
    onWingIt: () => void;
    isContextDoc?: boolean;
}

export function WingItEmptyState({ onWingIt, isContextDoc = false }: WingItEmptyStateProps) {
    if (isContextDoc) {
        return (
            <div className="flex flex-col w-full h-[500px] bg-white overflow-hidden relative group font-sans text-black">
                {/* Abstract Mathematical SVG Background pattern */}
                <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]">
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
                                <circle cx="2" cy="2" r="1.5" fill="black" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#dots)" />
                    </svg>
                </div>

                <div className="relative z-10 flex flex-col h-full items-center justify-center p-12">
                    {/* Core Mathematical Illustration - "Universal Set / Central Node" */}
                    <div className="mb-12 w-full max-w-2xl pointer-events-none">
                        <svg viewBox="0 0 600 200" className="w-full h-auto text-black drop-shadow-sm">
                            {/* The Central "Brain" / Universal Set perfectly centered at x=300 */}
                            <g className="transition-all duration-700" transform="translate(300, 100)">
                                {/* Concentric rings indicating gravity/influence */}
                                <circle cx="0" cy="0" r="70" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" className="opacity-30 animate-[spin_60s_linear_infinite]" />
                                <circle cx="0" cy="0" r="50" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-50" />

                                {/* The core knowledge base */}
                                <polygon points="0,-25 22,12 -22,12" fill="white" stroke="currentColor" strokeWidth="1.5" />
                                <polygon points="0,25 -22,-12 22,-12" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50" />
                                <circle cx="0" cy="0" r="6" fill="currentColor" />

                                {/* Label */}
                                <text x="0" y="-85" fontFamily="serif" fontSize="20" fill="currentColor" textAnchor="middle" className="italic opacity-90">U</text>
                            </g>

                            {/* Distributed Nodes receiving context */}
                            <g className="opacity-80">
                                {/* Left Node */}
                                <path d="M 170 100 C 210 100 230 100 250 100" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot-marker)" />
                                <rect x="140" y="85" width="30" height="30" fill="white" stroke="currentColor" strokeWidth="1.5" />
                                <line x1="145" y1="95" x2="165" y2="95" stroke="currentColor" strokeWidth="1" />
                                <line x1="145" y1="105" x2="160" y2="105" stroke="currentColor" strokeWidth="1" />

                                {/* Top Right Node */}
                                <path d="M 430 40 C 390 60 370 70 340 80" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot-marker)" />
                                <circle cx="445" cy="35" r="15" fill="white" stroke="currentColor" strokeWidth="1.5" />

                                {/* Bottom Right Node */}
                                <path d="M 430 160 C 390 140 370 130 340 120" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot-marker)" />
                                <polygon points="445,145 460,170 430,170" fill="white" stroke="currentColor" strokeWidth="1.5" />
                            </g>

                            <defs>
                                <marker id="dot-marker" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                                    <circle cx="5" cy="5" r="3" fill="currentColor" />
                                </marker>
                            </defs>
                        </svg>
                    </div>

                    <div className="flex flex-col items-center text-center space-y-6 max-w-lg pointer-events-none">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-semibold tracking-tight">The Global Axiom</h3>
                            <p className="text-gray-500 leading-relaxed">
                                Define the absolute rules, constraints, and background knowledge here. This context acts as the universal set underlying all AI operations across your workspace.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onWingIt}
                            className="inline-flex items-center justify-center px-6 py-3 space-x-2 text-sm font-medium text-black bg-white border border-black rounded-sm hover:bg-gray-100 transition-all duration-300 pointer-events-auto"
                        >
                            <span>Define Context Parameters</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-[500px] bg-white overflow-hidden relative group font-sans text-black">
            {/* Abstract Mathematical SVG Background pattern */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="black" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
            </div>

            <div className="relative z-10 flex flex-col h-full items-center justify-center p-12">
                {/* Core Mathematical Illustration - "Input to Output" */}
                <div className="mb-12 w-full max-w-2xl pointer-events-none">
                    <svg viewBox="0 0 600 200" className="w-full h-auto text-black drop-shadow-sm">

                        {/* 
                            LAYOUT GRID:
                            Left Block center ~ 150
                            Center Block center ~ 300
                            Right Block center ~ 450
                        */}

                        {/* LEFT SIDE: Raw Input (Chaos / Fragmented shapes) */}
                        <g className="opacity-80" transform="translate(130, 100)">
                            {/* Dashed background triangle */}
                            <polygon points="0,-40 -40,40 40,30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                            {/* Overlapping circle */}
                            <circle cx="-15" cy="-25" r="16" fill="white" stroke="currentColor" strokeWidth="1.5" />
                            {/* Floating square */}
                            <rect x="20" y="-45" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(15 28 -37)" />
                            {/* Sine wave / squiggly line */}
                            <path d="M -60 -10 Q -30 -60 0 10 T 60 0" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" className="opacity-60" />
                        </g>

                        {/* MIDDLE: arrow coming in */}
                        <g className="opacity-80">
                            <path d="M 210 100 L 255 100" fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
                        </g>

                        {/* CENTER: The algorithm / Wing It process (Structuring) */}
                        <g className="transition-all duration-700" transform="translate(300, 100)">
                            {/* Function Box */}
                            <rect x="-40" y="-30" width="80" height="60" rx="4" fill="white" stroke="currentColor" strokeWidth="1.5" />
                            {/* Internal lines representing text/processing */}
                            <line x1="-20" y1="-10" x2="20" y2="-10" stroke="currentColor" strokeWidth="1.5" />
                            <line x1="-20" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" />
                            <line x1="-20" y1="20" x2="0" y2="20" stroke="currentColor" strokeWidth="1.5" />

                            {/* Mathematical label above */}
                            <text x="0" y="-45" fontFamily="serif" fontSize="20" fill="currentColor" textAnchor="middle" className="italic opacity-90">f(x)</text>
                        </g>

                        {/* MIDDLE: arrow going out */}
                        <g className="opacity-80">
                            <path d="M 345 100 L 390 100" fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow)" />
                        </g>

                        {/* RIGHT SIDE: Refined Output (Structured / Perfect Geometry) */}
                        <g transform="translate(470, 100)">
                            {/* Background fill */}
                            <polygon points="0,-45 -45,45 45,45" fill="black" className="opacity-[0.08]" />

                            {/* Perfect Triangle */}
                            <polygon points="0,-45 -45,45 45,45" fill="none" stroke="currentColor" strokeWidth="2" />

                            {/* Precise Center Geometry */}
                            <circle cx="0" cy="15" r="22" fill="white" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="0" cy="15" r="10" fill="currentColor" />

                            {/* Vertical Axis of Symmetry */}
                            <line x1="0" y1="-60" x2="0" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" className="opacity-60" />
                        </g>

                        <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                            </marker>
                        </defs>
                    </svg>
                </div>

                <div className="flex flex-col items-center text-center space-y-6 max-w-lg pointer-events-none">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-semibold tracking-tight">Synthesize Ideas</h3>
                        <p className="text-gray-500 leading-relaxed">
                            Transform raw concepts into structured drafts. Start typing your thoughts naturally, or let AI generate the initial framework.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onWingIt}
                        className="inline-flex items-center justify-center px-6 py-3 space-x-2 text-sm font-medium text-black bg-white border border-black rounded-sm hover:bg-black hover:text-white transition-all duration-300 pointer-events-auto"
                    >
                        <span>Wing It</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
