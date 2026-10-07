import React, { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export const StarRating = ({
    value = 0,
    onChange,
    readOnly = false,
    size = 20,
    className = "",
}) => {
    const [hoverValue, setHoverValue] = useState(0);
    const activeValue = hoverValue || value;

    return (
        <div className={cn("inline-flex items-center gap-1", className)}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange && onChange(star)}
                    onMouseEnter={() => !readOnly && setHoverValue(star)}
                    onMouseLeave={() => !readOnly && setHoverValue(0)}
                    className={cn(
                        "transition-all duration-200 focus:outline-none",
                        readOnly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"
                    )}
                >
                    <Star
                        size={size}
                        className={cn(
                            "transition-colors duration-200",
                            star <= activeValue
                                ? "text-amber-400 fill-amber-400 drop-shadow-sm"
                                : "text-slate-200 fill-slate-100"
                        )}
                    />
                </button>
            ))}
        </div>
    );
};

export default StarRating;
