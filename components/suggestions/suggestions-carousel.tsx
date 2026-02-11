"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, Target, ArrowRight } from "lucide-react";
import { getSuggestions, Suggestion } from "@/lib/api/suggestions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { cn } from "@/lib/utils";

interface SuggestionsCarouselProps {
	onClose: () => void;
	onNavigate: (type: "task" | "habit", id: string) => void;
}

export function SuggestionsCarousel({ onClose, onNavigate }: SuggestionsCarouselProps) {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function loadSuggestions() {
			try {
				const data = await getSuggestions({ limit: 5, randomize: true });
				setSuggestions(data);
			} catch (error) {
				console.error("Error loading suggestions:", error);
			} finally {
				setLoading(false);
			}
		}
		loadSuggestions();
	}, []);

	const handlePrev = useCallback(() => {
		setCurrentIndex((prev) => (prev === 0 ? suggestions.length - 1 : prev - 1));
	}, [suggestions.length]);

	const handleNext = useCallback(() => {
		setCurrentIndex((prev) => (prev === suggestions.length - 1 ? 0 : prev + 1));
	}, [suggestions.length]);

	const handleCardClick = useCallback(
		(suggestion: Suggestion) => {
			onNavigate(suggestion.type, suggestion.id);
			onClose();
		},
		[onNavigate, onClose],
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const tagName = target?.tagName?.toLowerCase();
			if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) {
				return;
			}

			if (loading || suggestions.length === 0) {
				return;
			}

			const isSpace = event.code === "Space" || event.key === " ";
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				handlePrev();
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				handleNext();
				return;
			}
			if (isSpace) {
				event.preventDefault();
				if (event.shiftKey) {
					handlePrev();
				} else {
					handleNext();
				}
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				handleCardClick(suggestions[currentIndex]);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [loading, suggestions, currentIndex, handlePrev, handleNext, handleCardClick]);

	// Format numbers to remove excessive decimal places
	const formatNumber = (num: number, decimals: number = 1): string => {
		return num.toFixed(decimals);
	};

	const formatPercentage = (num: number): string => {
		return `${formatNumber(num)}%`;
	};

	if (loading) {
		return (
			<Dialog open onOpenChange={onClose}>
				<DialogContent className="max-w-2xl p-0 border-0 bg-transparent">
					<DialogTitle className="sr-only">Loading suggestions</DialogTitle>
					<div className="bg-white rounded-xl p-6">
						<LoadingSkeleton count={5} />
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	if (suggestions.length === 0) {
		return (
			<Dialog open onOpenChange={onClose}>
				<DialogContent className="max-w-md">
					<DialogTitle className="sr-only">All Caught Up</DialogTitle>
					<div className="text-center py-8">
						<div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
							<Target className="w-8 h-8 text-green-600" />
						</div>
						<p className="text-muted-foreground mb-4">
							Great job! You&apos;re on track with all your tasks and habits.
						</p>
						<Button onClick={onClose}>Close</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	const currentSuggestion = suggestions[currentIndex];
	const hasMultiple = suggestions.length > 1;

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent
				className="border-0 bg-transparent shadow-none !p-0 w-[min(92vw,800px)] sm:w-[min(88vw,800px)]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Suggested Next</DialogTitle>

				{/* Blue Card - Main Content with all buttons inside */}
				<div className="relative group w-full">
					<div
						className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white cursor-pointer hover:shadow-lg transition-shadow relative p-6 pb-14 sm:p-12 sm:pb-16"
						onClick={() => handleCardClick(currentSuggestion)}
						role="button"
						tabIndex={0}
						aria-label={`Open suggestion ${currentSuggestion.title}`}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							handleCardClick(currentSuggestion);
						}}
					>
						{/* Close Button - Inside blue card */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								onClose();
							}}
							className="absolute z-20 rounded-xs opacity-40 transition-opacity hover:opacity-70 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none p-1.5 text-white/60 hover:text-white/80"
							style={{ top: "1rem", right: "1rem" }}
							aria-label="Close suggestions"
						>
							<span className="sr-only">Close</span>
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>

						{/* Left Navigation Arrow - Inside blue card */}
						{hasMultiple && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									handlePrev();
								}}
								className={cn(
									"absolute top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full",
									"text-white/15 hover:text-white/40 hover:bg-white/5",
									"transition-all duration-200",
									"opacity-0 group-hover:opacity-60",
								)}
								style={{ left: "0.75rem" }}
								aria-label="Previous suggestion"
							>
								<ChevronLeft className="w-4 h-4" />
							</button>
						)}

						{/* Right Navigation Arrow - Inside blue card */}
						{hasMultiple && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									handleNext();
								}}
								className={cn(
									"absolute top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full",
									"text-white/15 hover:text-white/40 hover:bg-white/5",
									"transition-all duration-200",
									"opacity-0 hover:opacity-60 group-hover:opacity-60",
								)}
								style={{ right: "0.75rem" }}
								aria-label="Next suggestion"
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						)}

						{/* Main Content */}
						<div className="flex items-start justify-between mb-4">
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<h4 className="text-xl font-semibold">{currentSuggestion.title}</h4>
									<Badge variant="secondary" className="bg-white/20 text-white">
										{currentSuggestion.type}
									</Badge>
								</div>
								{currentSuggestion.description && (
									<p className="text-indigo-100 text-sm mb-3">{currentSuggestion.description}</p>
								)}
								{currentSuggestion.group && (
									<div className="flex items-center gap-2 text-sm text-indigo-100">
										{currentSuggestion.group.color && (
											<div
												className="w-3 h-3 rounded-full"
												style={{ backgroundColor: currentSuggestion.group.color }}
											/>
										)}
										<span>{currentSuggestion.group.name}</span>
									</div>
								)}
							</div>
							<div className="text-right">
								<p className="text-xs text-indigo-200 mb-1">Priority Score</p>
								<p className="text-2xl font-bold">{formatNumber(currentSuggestion.score, 1)}</p>
							</div>
						</div>

						{/* Progress Comparison */}
						<div className="grid grid-cols-3 gap-3 mb-4">
							<div className="bg-white/10 rounded-lg p-3">
								<p className="text-xs text-indigo-200 mb-1">Current</p>
								<p className="text-xl font-semibold">{formatPercentage(currentSuggestion.progress)}</p>
							</div>
							<div className="bg-white/10 rounded-lg p-3">
								<p className="text-xs text-indigo-200 mb-1">Expected</p>
								<p className="text-xl font-semibold">{formatPercentage(currentSuggestion.expectedProgress)}</p>
							</div>
							<div className="bg-white/10 rounded-lg p-3">
								<p className="text-xs text-indigo-200 mb-1">Behind</p>
								<p className="text-xl font-semibold text-amber-300 flex items-center gap-1">
									<TrendingDown className="w-4 h-4" />
									{formatPercentage(currentSuggestion.progressGap)}
								</p>
							</div>
						</div>

						{/* Progress Bar */}
						<div className="mb-4">
							<div className="flex items-center justify-between text-sm mb-2">
								<span className="text-indigo-100">Progress</span>
								<span>Importance: {currentSuggestion.importance}/100</span>
							</div>
							<div className="relative">
								<div className="w-full bg-white/20 rounded-full h-2.5">
									<div
										className="bg-white rounded-full h-2.5 transition-all"
										style={{ width: `${currentSuggestion.progress}%` }}
									/>
								</div>
								<div
									className="absolute top-0 h-2.5 border-r-2 border-amber-300"
									style={{ left: `${currentSuggestion.expectedProgress}%` }}
								/>
							</div>
						</div>

						{/* Labels */}
						{currentSuggestion.labels && currentSuggestion.labels.length > 0 && (
							<div className="flex gap-2 mb-4 flex-wrap max-h-20 overflow-y-auto">
								{currentSuggestion.labels.map((label) => (
									<Badge key={label.id} variant="secondary" className="bg-white/20 text-white">
										{label.name}
									</Badge>
								))}
							</div>
						)}

						{/* Click hint */}
						<div className="flex items-center justify-center gap-2 text-sm text-indigo-100">
							<span>Click to jump and highlight</span>
							<ArrowRight className="w-4 h-4" />
						</div>

						{/* Pagination Dots - Inside blue card, at bottom */}
						{hasMultiple && (
							<div
								className="flex items-center justify-center gap-2 absolute"
								style={{
									bottom: "1rem",
									left: "50%",
									transform: "translateX(-50%)",
								}}
							>
								{suggestions.map((_, index) => (
									<button
										key={index}
										onClick={(e) => {
											e.stopPropagation();
											setCurrentIndex(index);
										}}
										className={cn(
											"h-2 rounded-full transition-all duration-200",
											index === currentIndex ? "bg-white/50 w-6" : "bg-white/20 w-2 hover:bg-white/35",
										)}
										aria-label={`Go to suggestion ${index + 1}`}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
