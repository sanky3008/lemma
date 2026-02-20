'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AlertCircle } from 'lucide-react';

mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
        fontFamily: 'inherit',
        primaryColor: '#e0e7ff',
        primaryTextColor: '#1e1b4b',
        primaryBorderColor: '#6366f1',
        lineColor: '#6366f1',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#f8fafc',
    },
    securityLevel: 'loose',
    suppressErrorRendering: true,
});

interface MermaidDiagramProps {
    content: string;
}

export function MermaidDiagram({ content }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const renderDiagram = async () => {
            if (!containerRef.current || !content) return;

            try {
                setError(null);
                // Clear previous content
                containerRef.current.innerHTML = '';

                // Generate a random ID for this specific diagram render
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Render to SVG
                const { svg } = await mermaid.render(id, content);

                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = svg;

                    // Make the SVG scale with its container
                    const svgElement = containerRef.current.querySelector('svg');
                    if (svgElement) {
                        svgElement.style.width = '100%';
                        svgElement.style.height = 'auto';
                        svgElement.style.minWidth = '200px';
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    console.error('[Mermaid] Failed to render diagram:', err);
                    setError(err.message || 'Invalid diagram syntax');
                }
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
        };
    }, [content]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-6 border border-destructive/20 bg-destructive/5 rounded-md text-destructive my-4">
                <AlertCircle className="size-8 mb-2 opacity-80" />
                <p className="font-semibold text-sm">Failed to render diagram</p>
                <p className="text-xs opacity-80 mt-1 max-w-[400px] text-center font-mono break-words">
                    {error}
                </p>
            </div>
        );
    }

    return (
        <div
            className="flex justify-center items-center py-6 px-4 bg-muted/30 rounded-md overflow-x-auto min-h-[100px]"
            ref={containerRef}
        />
    );
}
