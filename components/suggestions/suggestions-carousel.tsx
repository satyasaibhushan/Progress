"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, TrendingDown, Target, ArrowRight } from "lucide-react";
import { getSuggestions, Suggestion } from "@/lib/api/suggestions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

interface SuggestionsCarouselProps {
  onClose: () => void;
  onNavigate: (type: "task" | "habit", id: string) => void;
}

export function SuggestionsCarousel({
  onClose,
  onNavigate,
}: SuggestionsCarouselProps) {
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

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? suggestions.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === suggestions.length - 1 ? 0 : prev + 1));
  };

  const handleCardClick = (suggestion: Suggestion) => {
    onNavigate(suggestion.type, suggestion.id);
    onClose();
  };

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Loading suggestions</DialogTitle>
          </DialogHeader>
          <LoadingSkeleton count={5} />
        </DialogContent>
      </Dialog>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>All Caught Up! 🎉</DialogTitle>
          </DialogHeader>
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Suggested Next</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Based on importance and deadline ({currentIndex + 1} of{" "}
                {suggestions.length})
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-6">
          <div
            className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleCardClick(currentSuggestion)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xl font-semibold">{currentSuggestion.title}</h4>
                  <Badge variant="secondary" className="bg-white/20 text-white">
                    {currentSuggestion.type}
                  </Badge>
                </div>
                {currentSuggestion.description && (
                  <p className="text-indigo-100 text-sm mb-3">
                    {currentSuggestion.description}
                  </p>
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
                <p className="text-2xl font-bold">{currentSuggestion.score}</p>
              </div>
            </div>

            {/* Progress Comparison */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-indigo-200 mb-1">Current</p>
                <p className="text-xl font-semibold">{currentSuggestion.progress}%</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-indigo-200 mb-1">Expected</p>
                <p className="text-xl font-semibold">
                  {currentSuggestion.expectedProgress}%
                </p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-indigo-200 mb-1">Behind</p>
                <p className="text-xl font-semibold text-amber-300 flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" />
                  {currentSuggestion.progressGap}%
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
              <div className="flex gap-2 mb-4">
                {currentSuggestion.labels.map((label) => (
                  <Badge
                    key={label.id}
                    variant="secondary"
                    className="bg-white/20 text-white"
                  >
                    {label.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Click hint */}
            <div className="flex items-center justify-center gap-2 text-sm text-indigo-100">
              <span>Click to view details</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Navigation */}
          {suggestions.length > 1 && (
            <div className="flex items-center justify-between mt-6">
              <Button variant="outline" size="icon" onClick={handlePrev}>
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <div className="flex gap-2">
                {suggestions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-2 rounded-full transition-all ${
                      index === currentIndex
                        ? "bg-indigo-600 w-6"
                        : "bg-slate-300 w-2"
                    }`}
                  />
                ))}
              </div>

              <Button variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
