import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, Typography, Button, Paper, Stepper, Step, StepLabel, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Select, MenuItem, FormControl, InputLabel, CircularProgress, Chip,
  Card, CardContent, Grid
} from '@mui/material';
import { 
  CloudUpload, Download, AlertCircle, CheckCircle, FileSpreadsheet, ArrowRight, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { sellerApi } from '../services/sellerApi';

const steps = ['Upload File', 'Validate & Preview', 'Processing', 'Summary'];

const getExcelName = (name, index) => "_" + name.replace(/[^a-zA-Z0-9]/g, "") + "_" + index;

const BulkUpload = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState(null);
  const [categories, setCategories] = useState([]);
  
  // Validation state
  const [parsedData, setParsedData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validRows, setValidRows] = useState([]);
  
  // Preview pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Import state
  const [importMode, setImportMode] = useState('draft'); // draft or publish
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('queued'); // queued, processing, completed
  const [importResults, setImportResults] = useState(null);
  
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
  }, []);

  const DEFAULT_CATEGORIES = [
    {
      name: "Daily Essentials",
      children: [
        { name: "Dairy & Bread", children: [{ name: "Milk" }, { name: "Bread" }, { name: "Eggs" }] },
        { name: "Beverages", children: [{ name: "Soft Drinks" }, { name: "Juices" }, { name: "Tea & Coffee" }] }
      ]
    },
    {
      name: "Electronics",
      children: [
        { name: "Mobiles", children: [{ name: "Smartphones" }, { name: "Feature Phones" }] },
        { name: "Accessories", children: [{ name: "Chargers" }, { name: "Earphones" }, { name: "Cases" }] }
      ]
    },
    {
      name: "Grocery",
      children: [
        { name: "Staples", children: [{ name: "Rice" }, { name: "Atta & Flour" }, { name: "Pulses" }, { name: "Oil" }] },
        { name: "Snacks", children: [{ name: "Chips" }, { name: "Biscuits" }, { name: "Chocolates" }] }
      ]
    },
    {
      name: "HealthCare",
      children: [
        { name: "Medicines", children: [{ name: "Pain Relief" }, { name: "Cold & Cough" }] },
        { name: "Personal Care", children: [{ name: "Shampoo" }, { name: "Soap & Body Wash" }, { name: "Toothpaste" }] }
      ]
    },
    {
      name: "Home & Kitchen",
      children: [
        { name: "Cookware", children: [{ name: "Pans & Pots" }, { name: "Tawas" }] },
        { name: "Cleaning", children: [{ name: "Detergents" }, { name: "Floor Cleaners" }, { name: "Garbage Bags" }] }
      ]
    },
    {
      name: "Kids",
      children: [
        { name: "Toys", children: [{ name: "Action Figures" }, { name: "Board Games" }, { name: "Soft Toys" }] },
        { name: "Baby Care", children: [{ name: "Diapers" }, { name: "Baby Wipes" }, { name: "Baby Lotion" }] }
      ]
    },
    {
      name: "Pet Supplies",
      children: [
        { name: "Dog Food", children: [{ name: "Dry Food" }, { name: "Wet Food" }, { name: "Treats" }] },
        { name: "Cat Food", children: [{ name: "Dry Food" }, { name: "Wet Food" }, { name: "Litter" }] }
      ]
    },
    {
      name: "Sports",
      children: [
        { name: "Fitness", children: [{ name: "Dumbbells" }, { name: "Yoga Mats" }, { name: "Resistance Bands" }] },
        { name: "Games", children: [{ name: "Badminton" }, { name: "Cricket" }, { name: "Football" }] }
      ]
    },
    {
      name: "Stationary",
      children: [
        { name: "Office Supply", children: [{ name: "Pens" }, { name: "Notebooks" }, { name: "Files" }] },
        { name: "School Supply", children: [{ name: "Pencils" }, { name: "Erasers" }, { name: "Geometry Box" }] }
      ]
    },
    {
      name: "Test",
      children: [
        { name: "Test Category", children: [{ name: "Test Subcategory" }] }
      ]
    },
    {
      name: "fashion & Lifestyle",
      children: [
        { name: "Clothing", children: [{ name: "T-shirts" }, { name: "Jeans" }, { name: "Shirts" }] },
        { name: "Footwear", children: [{ name: "Sneakers" }, { name: "Slippers" }, { name: "Formal Shoes" }] }
      ]
    },
    {
      name: "garden",
      children: [
        { name: "Plants", children: [{ name: "Seeds" }, { name: "Indoor Plants" }, { name: "Flowering Plants" }] },
        { name: "Tools", children: [{ name: "Pots" }, { name: "Watering Cans" }, { name: "Shovels" }] }
      ]
    },
    {
      name: "music",
      children: [
        { name: "Instruments", children: [{ name: "Guitars" }, { name: "Keyboards" }, { name: "Drums" }] },
        { name: "Accessories", children: [{ name: "Strings" }, { name: "Picks" }, { name: "Stands" }] }
      ]
    }
  ];

  const mergeCategories = (dbCats, defaultCats) => {
    const merged = [...dbCats];
    defaultCats.forEach(defCat => {
      const existing = merged.find(c => c.name.toLowerCase() === defCat.name.toLowerCase());
      if (!existing) {
        merged.push(defCat);
      } else {
        if (defCat.children) {
          if (!existing.children) existing.children = [];
          defCat.children.forEach(defSub => {
            const existingSub = existing.children.find(s => s.name.toLowerCase() === defSub.name.toLowerCase());
            if (!existingSub) {
              existing.children.push(defSub);
            } else {
              if (defSub.children) {
                if (!existingSub.children) existingSub.children = [];
                defSub.children.forEach(defSubSub => {
                  const existingSubSub = existingSub.children.find(ss => ss.name.toLowerCase() === defSubSub.name.toLowerCase());
                  if (!existingSubSub) {
                    existingSub.children.push(defSubSub);
                  }
                });
              }
            }
          });
        }
      }
    });
    return merged;
  };

  const fetchCategories = async () => {
    try {
      const res = await sellerApi.getCategoryTree();
      const dbCategories = res.data.results || res.data.result || res.data.data || [];
      setCategories(mergeCategories(dbCategories, DEFAULT_CATEGORIES));
    } catch (err) {
      console.warn('Failed to fetch categories from DB, using fallback defaults.');
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const generateTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      
      // 1. Lists Sheet
      const listSheet = workbook.addWorksheet('Lists', { state: 'veryHidden' });
      await listSheet.protect('quickemart123', {
        selectLockedCells: false,
        selectUnlockedCells: false,
      });
      
      // Setup Mapping Table in Columns A and B
      listSheet.getCell('A1').value = 'Parent Name';
      listSheet.getCell('B1').value = 'Named Range';
      let mappingRowIndex = 2; // For lookup table in cols A, B
      
      let listColIndex = 4; // Start category lists from Column D (4) to avoid overwriting Columns A and B
      
      const addListAndMapping = (parentName, items, indexCounter) => {
        if (!items || items.length === 0) return;
        const rangeName = getExcelName(parentName, indexCounter);
        
        // Write to column
        listSheet.getColumn(listColIndex).values = [parentName, ...items.map(i => i.name)];
        
        // Add named range for this list (excluding header)
        const colLetter = listSheet.getColumn(listColIndex).letter;
        workbook.definedNames.add(`Lists!$${colLetter}$2:$${colLetter}$${items.length + 1}`, rangeName);
        
        // Add to mapping table
        listSheet.getCell(`A${mappingRowIndex}`).value = parentName;
        listSheet.getCell(`B${mappingRowIndex}`).value = rangeName;
        
        mappingRowIndex++;
        listColIndex++;
      };

      // Create Main Categories List in Column C (3)
      listSheet.getColumn(3).values = ['Main Categories', ...categories.map(c => c.name)];
      const mainColLetter = listSheet.getColumn(3).letter;
      workbook.definedNames.add(`Lists!$${mainColLetter}$2:$${mainColLetter}$${categories.length + 1}`, 'MainCategories');

      // Add CategoryMap named range for VLOOKUP (excluding headers)
      workbook.definedNames.add('Lists!$A$2:$B$1000', 'CategoryMap');

      // Create Dependent Lists
      let indexCounter = 1;
      categories.forEach(mainCat => {
        addListAndMapping(mainCat.name, mainCat.children, indexCounter++);
        if (mainCat.children) {
          mainCat.children.forEach(subCat => {
            addListAndMapping(subCat.name, subCat.children, indexCounter++);
          });
        }
      });

      // 2. Products Sheet
      const sheet = workbook.addWorksheet('Products');
      
      // Protect the Products sheet (headers and instructions)
      await sheet.protect('quickemart123', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        deleteColumns: false,
        deleteRows: false,
      });

      // Add Instructions
      sheet.mergeCells('A1:AJ1');
      sheet.getCell('A1').value = 'INSTRUCTIONS & RULES: 1. Columns with * are required. 2. Select categories from dropdowns. 3. Variant 1 is required.';
      sheet.getCell('A1').font = { italic: true, color: { argb: 'FF555555' } };
      sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      sheet.getCell('A1').protection = { locked: true };

      const headers = [
        'Product Title *', 'Description', 'Brand Name', 'Weight', 'Tags (comma-separated)',
        'Main Group *', 'Specific Category *', 'Sub-Category', 'Status (Active/Inactive)',
        'Main Image URL', 'Gallery Image URLs (comma-separated)',
        'Variant 1 Name *', 'Variant 1 Price *', 'Variant 1 Sale Price', 'Variant 1 Stock *', 'Variant 1 SKU',
        'Variant 2 Name', 'Variant 2 Price', 'Variant 2 Sale Price', 'Variant 2 Stock', 'Variant 2 SKU',
        'Variant 3 Name', 'Variant 3 Price', 'Variant 3 Sale Price', 'Variant 3 Stock', 'Variant 3 SKU',
        'Variant 4 Name', 'Variant 4 Price', 'Variant 4 Sale Price', 'Variant 4 Stock', 'Variant 4 SKU',
        'Variant 5 Name', 'Variant 5 Price', 'Variant 5 Sale Price', 'Variant 5 Stock', 'Variant 5 SKU'
      ];

      sheet.addRow(headers);
      const headerRow = sheet.getRow(2);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      headerRow.protection = { locked: true };
      
      // Adjust column widths and Sample Formatting
      sheet.columns.forEach((col, i) => {
        col.width = headers[i].length < 15 ? 15 : 25;
        // Set sample formatting for specific columns
        if (headers[i].includes('Price') || headers[i].includes('Stock')) {
          col.numFmt = '#,##0.00'; // Number format
        } else if (headers[i].includes('SKU')) {
          col.numFmt = '@'; // Text format
        }
      });

      // Add Data Validation to rows and UNLOCK them for editing
      // Start from 3 up to 102
      for (let i = 3; i <= 102; i++) {
        const row = sheet.getRow(i);
        // Unlock data cells
        for (let col = 1; col <= headers.length; col++) {
          row.getCell(col).protection = { locked: false };
        }

        // Main Group (Col F / 6)
        sheet.getCell(`F${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['MainCategories']
        };

        // Specific Category (Col G / 7)
        sheet.getCell(`G${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`INDIRECT(VLOOKUP($F${i}, CategoryMap, 2, FALSE))`]
        };

        // Sub-Category (Col H / 8)
        sheet.getCell(`H${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`INDIRECT(VLOOKUP($G${i}, CategoryMap, 2, FALSE))`]
        };

        // Status (Col I / 9)
        sheet.getCell(`I${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Active,Inactive"']
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), 'Product_Bulk_Upload_Template.xlsx');
      toast.success('Template downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate template');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFile(file);
    parseFile(file);
  };

  const parseFile = (file) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[1] || wb.SheetNames[0]; // If index 0 is 'Lists', take 1 ('Products')
        // Prefer 'Products' sheet if it exists
        const sheetName = wb.SheetNames.includes('Products') ? 'Products' : wb.SheetNames[0];
        
        // Skip first row (instructions), headers are on second row
        const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: 1 });
        
        setParsedData(data);
        validateData(data);
        setActiveStep(1);
      } catch (err) {
        console.error('Excel file parsing failed:', err);
        toast.error(`Failed to parse file: ${err.message || 'Please ensure it matches the template'}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const validateData = (data) => {
    const errors = [];
    const valid = [];
    
    data.forEach((row, index) => {
      const rowNum = index + 3; // +2 for header/instructions, +1 for 0-index
      const rowErrors = [];
      
      const title = row['Product Title *'];
      const mainGroup = row['Main Group *'];
      const specificCat = row['Specific Category *'];
      const v1Name = row['Variant 1 Name *'];
      const v1Price = row['Variant 1 Price *'];
      const v1Stock = row['Variant 1 Stock *'];

      if (!title) rowErrors.push('Product Title is required');
      if (!mainGroup) rowErrors.push('Main Group is required');
      if (!specificCat) rowErrors.push('Specific Category is required');
      if (!v1Name) rowErrors.push('Variant 1 Name is required');
      if (v1Price === undefined) rowErrors.push('Variant 1 Price is required');
      if (v1Stock === undefined) rowErrors.push('Variant 1 Stock is required');

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, title: title || 'Unknown', errors: rowErrors });
      } else {
        valid.push(row);
      }
    });

    setValidationErrors(errors);
    setValidRows(valid);
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setActiveStep(2);
    setImportStatus('processing');
    setIsImporting(true);

    try {
      const products = validRows.map(row => {
        const variants = [];
        // Extract up to 5 variants
        for (let i = 1; i <= 5; i++) {
          if (row[`Variant ${i} Name *`] || row[`Variant ${i} Name`]) {
            variants.push({
              name: row[`Variant ${i} Name *`] || row[`Variant ${i} Name`],
              price: row[`Variant ${i} Price *`] || row[`Variant ${i} Price`],
              salePrice: row[`Variant ${i} Sale Price`],
              stock: row[`Variant ${i} Stock *`] || row[`Variant ${i} Stock`],
              sku: row[`Variant ${i} SKU`]
            });
          }
        }

        return {
          name: row['Product Title *'],
          description: row['Description'],
          brand: row['Brand Name'],
          weight: row['Weight'],
          tags: row['Tags (comma-separated)'] ? row['Tags (comma-separated)'].split(',').map(t => t.trim()) : [],
          mainGroup: row['Main Group *'],
          specificCategory: row['Specific Category *'],
          subCategory: row['Sub-Category'],
          status: row['Status (Active/Inactive)']?.toLowerCase() === 'inactive' ? 'inactive' : 'active',
          mainImageUrl: row['Main Image URL'],
          galleryUrls: row['Gallery Image URLs (comma-separated)'] ? row['Gallery Image URLs (comma-separated)'].split(',').map(u => u.trim()) : [],
          variants
        };
      });

      const res = await sellerApi.bulkImportProducts({ products, mode: importMode });
      const data = res.data?.result || {};
      setImportResults({
        imported: data.importedCount || 0,
        failed: 0,
        errors: []
      });
      setImportStatus('completed');
      setActiveStep(3);
      toast.success('All products imported successfully');
    } catch (err) {
      const resData = err.response?.data;
      if (resData && resData.message === "Import completed with errors") {
        const result = resData.result || {};
        setImportResults({
          imported: result.importedCount || 0,
          failed: result.errors?.length || 0,
          errors: result.errors || []
        });
        setImportStatus('completed');
        setActiveStep(3);
        toast.warning('Import completed with some errors');
      } else {
        console.error('Import products API request failed:', resData || err);
        toast.error(`Failed during import processing: ${resData?.message || err.message}`);
        setImportStatus('queued');
        setActiveStep(1);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 2 }}>
        <Button onClick={() => navigate('/seller/products')} variant="outlined" startIcon={<ArrowLeft />}>
          Back to Products
        </Button>
        <Typography variant="h4" fontWeight="bold">Bulk Product Upload</Typography>
      </Box>

      <Stepper activeStep={activeStep} sx={{ mb: 6 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0: Upload */}
      {activeStep === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card elevation={2}>
            <CardContent sx={{ p: 4 }}>
              <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>1. Download Template</Typography>
                  <Typography color="text.secondary" paragraph>
                    Download our Excel template with predefined columns and category dropdowns to ensure your data is formatted correctly.
                  </Typography>
                  <Button 
                    variant="contained" 
                    color="secondary" 
                    startIcon={<Download />}
                    onClick={generateTemplate}
                  >
                    Download Template
                  </Button>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>2. Upload Completed File</Typography>
                  <Typography color="text.secondary" paragraph>
                    Upload your filled `.xlsx` or `.csv` file. We will validate the data before importing.
                  </Typography>
                  
                  <Box
                    sx={{
                      border: '2px dashed',
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 4,
                      textAlign: 'center',
                      bgcolor: 'background.default',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      hidden 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept=".xlsx, .csv" 
                    />
                    <CloudUpload size={48} color="#666" style={{ marginBottom: 16 }} />
                    <Typography variant="h6">Click to Browse or Drag & Drop</Typography>
                    <Typography color="text.secondary">Supports .xlsx and .csv files</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Step 1: Validate & Preview */}
      {activeStep === 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={4}>
              <Card sx={{ bgcolor: 'primary.50' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>Total Rows Found</Typography>
                  <Typography variant="h4">{parsedData.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={4}>
              <Card sx={{ bgcolor: 'success.50' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>Valid Rows</Typography>
                  <Typography variant="h4" color="success.main">{validRows.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={4}>
              <Card sx={{ bgcolor: 'error.50' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>Rows with Errors</Typography>
                  <Typography variant="h4" color="error.main">{validationErrors.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {validationErrors.length > 0 && (
            <Paper sx={{ mb: 4, p: 3, borderLeft: '4px solid', borderColor: 'error.main' }}>
              <Typography variant="h6" color="error" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AlertCircle /> Validation Errors Found
              </Typography>
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Row #</TableCell>
                      <TableCell>Product Title</TableCell>
                      <TableCell>Errors</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {validationErrors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell>{err.title}</TableCell>
                        <TableCell>
                          {err.errors.map((e, idx) => (
                            <Chip key={idx} label={e} color="error" size="small" variant="outlined" sx={{ mr: 1, mb: 1 }} />
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Import Mode</InputLabel>
              <Select value={importMode} label="Import Mode" onChange={(e) => setImportMode(e.target.value)}>
                <MenuItem value="draft">Save as Drafts</MenuItem>
                <MenuItem value="publish">Publish Immediately</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button onClick={() => { setFile(null); setActiveStep(0); }} variant="outlined">
                Re-upload File
              </Button>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleImport}
                disabled={validRows.length === 0}
                endIcon={<ArrowRight />}
              >
                Start Import ({validRows.length} items)
              </Button>
            </Box>
          </Box>
        </motion.div>
      )}

      {/* Step 2: Processing */}
      {activeStep === 2 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress size={64} sx={{ mb: 4 }} />
          <Typography variant="h5" gutterBottom>Importing Products...</Typography>
          <Typography color="text.secondary">Please do not close this window.</Typography>
        </Box>
      )}

      {/* Step 3: Summary */}
      {activeStep === 3 && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card elevation={3} sx={{ textAlign: 'center', py: 6, px: 3, maxWidth: 600, mx: 'auto' }}>
            {importResults?.failed > 0 ? (
              <AlertCircle size={64} color="#f44336" style={{ margin: '0 auto 24px' }} />
            ) : (
              <CheckCircle size={64} color="#4caf50" style={{ margin: '0 auto 24px' }} />
            )}
            <Typography variant="h4" gutterBottom>
              {importResults?.failed > 0 ? 'Import Completed with Errors' : 'Import Completed!'}
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, my: 4 }}>
              <Box>
                <Typography variant="h3" color="success.main">{importResults?.imported || 0}</Typography>
                <Typography color="text.secondary">Successfully Imported</Typography>
              </Box>
              <Box>
                <Typography variant="h3" color="error.main">{importResults?.failed || 0}</Typography>
                <Typography color="text.secondary">Failed</Typography>
              </Box>
            </Box>

            {importResults?.errors?.length > 0 && (
              <Paper sx={{ mb: 4, p: 3, maxHeight: 200, overflowY: 'auto', textAlign: 'left', bgcolor: 'grey.50', borderLeft: '4px solid', borderColor: 'error.main' }}>
                <Typography variant="subtitle2" color="error" gutterBottom fontWeight="bold">
                  Failed Rows:
                </Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importResults.errors.map((err, idx) => (
                    <li key={idx} style={{ color: '#d32f2f', fontSize: '0.875rem', marginBottom: 4 }}>
                      {err}
                    </li>
                  ))}
                </ul>
              </Paper>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button onClick={() => { setFile(null); setActiveStep(0); }} variant="outlined">
                Upload Another File
              </Button>
              <Button variant="contained" onClick={() => navigate('/seller/products')}>
                View Products
              </Button>
            </Box>
          </Card>
        </motion.div>
      )}

    </Box>
  );
};

export default BulkUpload;
