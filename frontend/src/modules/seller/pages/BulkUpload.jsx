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
import { saveAs } from 'file-saver';
import { sellerApi } from '../services/sellerApi';

const steps = ['Upload File', 'Validate & Preview', 'Processing', 'Summary'];

const getExcelName = (name, index) => "_" + name.replace(/[^a-zA-Z0-9]/g, "") + "_" + index;

const BulkUpload = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState(null);
  const [adminBrands, setAdminBrands] = useState([]);
  const [adminVariants, setAdminVariants] = useState([]);
  
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
    fetchCatalogData();
  }, []);

  const fetchCatalogData = async () => {
    try {
      const [catRes, brandRes, productRes] = await Promise.all([
        sellerApi.getCategoryTree().catch(() => ({ data: {} })),
        sellerApi.getCatalogBrands().catch(() => ({ data: {} })),
        sellerApi.getCatalogProducts().catch(() => ({ data: {} }))
      ]);
      
      const dbCategories = catRes.data?.results || catRes.data?.result || catRes.data?.data || [];
      setCategories(dbCategories);

      const brands = brandRes.data?.results || [];
      setAdminBrands(brands.filter(Boolean));

      const masterProducts = productRes.data?.results || [];
      const variantSet = new Set(['Default']);
      masterProducts.forEach(mp => {
        if (Array.isArray(mp.variants)) {
          mp.variants.forEach(v => {
            if (v.name) variantSet.add(v.name);
          });
        }
      });
      setAdminVariants([...variantSet]);
    } catch (err) {
      console.error('Failed to fetch catalog data', err);
    }
  };

  const findMainCategoryObj = (mainCatName) => {
    if (!mainCatName) return null;
    const catNameLower = String(mainCatName).trim().toLowerCase();
    for (const header of categories) {
      if (Array.isArray(header.children)) {
        const found = header.children.find(c => String(c.name).trim().toLowerCase() === catNameLower);
        if (found) return found;
      }
    }
    return null;
  };

  const generateTemplate = async () => {
    try {
      const response = await sellerApi.downloadTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      saveAs(blob, 'Product_Bulk_Upload_Template.xlsx');
      toast.success('Template downloaded successfully');
    } catch (err) {
      console.error('Template download error:', err);
      toast.error(`Failed to download template: ${err.message || 'Server error'}`);
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
        const wsname = wb.SheetNames.includes('Products') ? 'Products' : wb.SheetNames[0];
        
        // Skip instructions (row 1), headers are on second row
        const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { range: 1 });
        
        // Filter out sample reference row if present
        const data = rawData.filter(row => {
          const title = row['Product Title *'] || row['Product Title'] || row['Product Name'];
          return title && String(title).trim().toLowerCase() !== 'sample product';
        });

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
      
      const title = row['Product Title *'] || row['Product Title'] || row['Product Name'];
      const headerCat = row['Header Category *'] || row['Header Category'] || row['Main Group *'] || row['Main Group'];
      const mainCat = row['Main Category *'] || row['Main Category'] || row['Specific Category *'] || row['Specific Category'];
      const subCat = row['Sub Category'] || row['Sub-Category'];
      const vName = row['Variant Name *'] || row['Variant Name'] || row['Variant 1 Name *'] || row['Variant 1 Name'];
      const price = row['Price *'] || row['Price'] || row['Variant 1 Price *'] || row['Variant 1 Price'];
      const stock = row['Stock *'] || row['Stock'] || row['Variant 1 Stock *'] || row['Variant 1 Stock'];

      if (!title) rowErrors.push('Product Title is required');
      if (!headerCat) rowErrors.push('Header Category is required');
      if (!mainCat) rowErrors.push('Main Category is required');

      // Conditional check: if mainCat has sub-categories in DB, subCat is MANDATORY
      const mainCatObj = findMainCategoryObj(mainCat);
      const hasSubCategoriesInDb = mainCatObj && Array.isArray(mainCatObj.children) && mainCatObj.children.length > 0;
      if (hasSubCategoriesInDb && !subCat) {
        rowErrors.push(`Sub Category is required for Main Category "${mainCat}"`);
      }

      if (!vName) rowErrors.push('Variant Name is required');
      if (price === undefined || price === null || String(price).trim() === '') rowErrors.push('Price is required');
      if (stock === undefined || stock === null || String(stock).trim() === '') rowErrors.push('Stock is required');

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
        const title = row['Product Title *'] || row['Product Title'] || row['Product Name'];
        const headerCat = row['Header Category *'] || row['Header Category'] || row['Main Group *'] || row['Main Group'];
        const mainCat = row['Main Category *'] || row['Main Category'] || row['Specific Category *'] || row['Specific Category'];
        const subCat = row['Sub Category'] || row['Sub-Category'] || '';
        const brand = row['Brand Name'] || row['Brand'] || '';
        const vName = row['Variant Name *'] || row['Variant Name'] || row['Variant 1 Name *'] || row['Variant 1 Name'] || 'Default';
        const packSize = row['Pack Size / Unit'] || row['Pack Size'] || row['Unit'] || row['Weight'] || '';
        const price = row['Price *'] || row['Price'] || row['Variant 1 Price *'] || row['Variant 1 Price'];
        const salePrice = row['Sale Price'] || row['Variant 1 Sale Price'] || null;
        const stock = row['Stock *'] || row['Stock'] || row['Variant 1 Stock *'] || row['Variant 1 Stock'];

        const variants = [
          {
            name: vName,
            price: Number(price || 0),
            salePrice: salePrice ? Number(salePrice) : null,
            stock: Number(stock || 0),
            packSize: packSize
          }
        ];

        // Also check if legacy multiple variants exist
        for (let i = 2; i <= 5; i++) {
          if (row[`Variant ${i} Name *`] || row[`Variant ${i} Name`]) {
            variants.push({
              name: row[`Variant ${i} Name *`] || row[`Variant ${i} Name`],
              price: Number(row[`Variant ${i} Price *`] || row[`Variant ${i} Price`] || 0),
              salePrice: row[`Variant ${i} Sale Price`] ? Number(row[`Variant ${i} Sale Price`]) : null,
              stock: Number(row[`Variant ${i} Stock *`] || row[`Variant ${i} Stock`] || 0),
              sku: row[`Variant ${i} SKU`]
            });
          }
        }

        return {
          name: title,
          description: row['Description'] || '',
          brand: brand,
          weight: packSize,
          mainGroup: headerCat,
          specificCategory: mainCat,
          subCategory: subCat,
          status: 'active',
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
