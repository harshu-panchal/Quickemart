import { getServicedCities } from "../services/servicedCitiesService.js";
import { handleResponse } from "../utils/helper.js";

export async function fetchServicedCities(req, res) {
  try {
    const forceRefresh = req.query.refresh === 'true' || req.query.bypassCache === 'true';
    const cities = await getServicedCities(forceRefresh);
    return handleResponse(res, 200, "Serviced cities fetched successfully", { cities });
  } catch (error) {
    console.error("Error fetching serviced cities:", error);
    return handleResponse(res, 500, "Failed to fetch serviced cities");
  }
}
