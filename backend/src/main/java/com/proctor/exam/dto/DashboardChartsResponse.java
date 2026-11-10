package com.proctor.exam.dto;

import java.util.List;

/**
 * Four chart series for the admin dashboard.
 * All data is raw series (labels + values); charting is done entirely on the frontend.
 */
public record DashboardChartsResponse(
        /** Warning count grouped by exam name */
        List<LabelValue> warningsByExam,
        /** Warning count grouped by event type */
        List<LabelValue> warningsByType,
        /** Warning count in hourly buckets over the last 7 days */
        List<TimeSeriesPoint> warningsTimeline,
        /** Attempt score distribution in 10-point buckets (0–10, 10–20, ...) */
        List<LabelValue> scoreDistribution
) {
    public record LabelValue(String label, long value) {}
    public record TimeSeriesPoint(String hour, long count) {}
}
