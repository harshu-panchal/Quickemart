import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus, X, Tag, Search } from 'lucide-react';

/**
 * BrandSelect - Searchable Combobox Component with 'Add New Brand' functionality.
 *
 * @param {Object} props
 * @param {string} props.value - Currently selected brand name
 * @param {Function} props.onChange - Callback fired when a brand is selected or typed
 * @param {Array<string>} props.brands - Array of existing brand names
 * @param {string} [props.placeholder="Select or enter brand..."] - Input placeholder
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {boolean} [props.allowNewBrand=true] - Whether custom brand addition is enabled
 * @param {string} [props.className=""] - Extra container CSS classes
 */
export const BrandSelect = ({
  value = '',
  onChange,
  brands = [],
  placeholder = 'Select or enter brand...',
  disabled = false,
  allowNewBrand = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customBrand, setCustomBrand] = useState('');

  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter and sort brands matching search query
  const getFilteredBrands = () => {
    if (!brands || !Array.isArray(brands)) return [];
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return brands;

    // Split into prefix match vs substring match
    const prefixMatches = [];
    const containsMatches = [];

    brands.forEach((brand) => {
      const bLower = brand.toLowerCase();
      if (bLower.startsWith(q)) {
        prefixMatches.push(brand);
      } else if (bLower.includes(q)) {
        containsMatches.push(brand);
      }
    });

    // Sort each list alphabetically
    prefixMatches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    containsMatches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return [...prefixMatches, ...containsMatches];
  };

  const filteredBrands = getFilteredBrands();

  // Check if searchQuery exactly matches an existing brand (case-insensitive)
  const isExactMatch = brands.some(
    (b) => b.toLowerCase() === (searchQuery || '').trim().toLowerCase()
  );

  const handleSelectBrand = (brandName) => {
    onChange(brandName);
    setSearchQuery('');
    setIsCustomMode(false);
    setIsOpen(false);
  };

  const handleStartCustomBrand = () => {
    setIsCustomMode(true);
    setCustomBrand(searchQuery.trim());
    setIsOpen(false);
  };

  const handleSaveCustomBrand = () => {
    const trimmed = customBrand.trim();
    if (trimmed) {
      onChange(trimmed);
    }
    setIsCustomMode(false);
    setCustomBrand('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsCustomMode(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {isCustomMode ? (
        /* Custom New Brand Input Mode */
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customBrand}
              onChange={(e) => setCustomBrand(e.target.value)}
              placeholder="Enter new brand name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveCustomBrand();
                } else if (e.key === 'Escape') {
                  setIsCustomMode(false);
                }
              }}
              className="w-full pl-3 pr-8 py-2.5 bg-slate-100 border-2 border-emerald-500 rounded-xl text-sm font-semibold outline-none ring-2 ring-emerald-500/20 text-slate-800 transition-all"
            />
            {customBrand && (
              <button
                type="button"
                onClick={() => setCustomBrand('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveCustomBrand}
            disabled={!customBrand.trim()}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 shrink-0"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            type="button"
            onClick={() => setIsCustomMode(false)}
            className="px-2.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl text-xs font-bold transition-all shrink-0"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Select & Search Combobox Mode */
        <div>
          <div
            onClick={() => {
              if (!disabled) {
                setIsOpen(!isOpen);
                if (!isOpen) {
                  setTimeout(() => inputRef.current?.focus(), 50);
                }
              }
            }}
            className={`w-full px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-semibold flex items-center justify-between cursor-pointer border border-transparent hover:border-slate-200 transition-all ${
              isOpen ? 'ring-2 ring-primary/20 bg-white border-primary/30' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-2 overflow-hidden mr-2">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              {value ? (
                <span className="text-slate-800 font-bold truncate">{value}</span>
              ) : (
                <span className="text-slate-400 font-normal truncate">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {value && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 rounded-full transition-colors"
                  title="Clear Brand"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-primary' : ''
                }`}
              />
            </div>
          </div>

          {/* Dropdown Menu */}
          {isOpen && !disabled && (
            <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              {/* Search Header */}
              <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search brand (e.g. boAt)..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-slate-800"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Brands Options List */}
              <div className="max-h-56 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                {filteredBrands.length > 0 ? (
                  filteredBrands.map((b) => {
                    const isSelected = b.toLowerCase() === (value || '').toLowerCase();
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleSelectBrand(b)}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{b}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-3 text-center text-xs font-medium text-slate-400">
                    No matching brands found
                  </div>
                )}

                {/* Option to create brand with current search query if not exact match */}
                {allowNewBrand && searchQuery.trim() && !isExactMatch && (
                  <button
                    type="button"
                    onClick={() => handleSelectBrand(searchQuery.trim())}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-50 text-left flex items-center gap-2 border border-dashed border-emerald-200 mt-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Add "<strong className="underline">{searchQuery.trim()}</strong>" as new brand
                    </span>
                  </button>
                )}

                {/* Explicit '+ Add New Brand' Button */}
                {allowNewBrand && (
                  <button
                    type="button"
                    onClick={handleStartCustomBrand}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-primary text-left flex items-center gap-2 border-t border-slate-100 mt-1 pt-2 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>+ Write / Add New Brand</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BrandSelect;
