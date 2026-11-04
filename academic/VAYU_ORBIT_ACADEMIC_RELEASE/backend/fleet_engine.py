import sqlite3
import pandas as pd
try:
    from ortools.linear_solver import pywraplp
except ImportError:
    pywraplp = None

def fetch_available_vehicles(db_path='military_logistics.db'):
    """Pulls the live military vehicle catalog from the relational database."""
    conn = sqlite3.connect(db_path)
    df = pd.read_sql_query("SELECT * FROM vehicle_master", conn)
    conn.close()
    return df.to_dict('records')

def build_dynamic_cargo():
    """Captures real-world user cargo requirements at runtime."""
    print("\n--- [ PHASE 1: CARGO MANIFEST ] ---")
    cargo = []
    c_id = 1
    
    while True:
        desc = input("\nEnter Cargo Name (or type 'done' to finalize): ").strip()
        if desc.lower() == 'done': break
        
        try:
            weight = float(input("Enter Weight (Tons): "))
            hazard_class = input("Enter Hazard/Category Class (e.g., EXPLOSIVE, PERSONNEL, RATIONS, POL): ").strip().upper()
            cargo.append({"ID": f"C-{c_id}", "Desc": desc, "Weight": weight, "Class": hazard_class})
            c_id += 1
        except ValueError:
            print("❌ Invalid weight. Please enter a number.")
            
    return cargo

def optimize_dynamic_load(cargo, fleet_inventory):
    """
    MILP Solver that adapts its segregation logic dynamically based 
    on the unique hazard classes entered by the user.
    """
    if not cargo or not fleet_inventory:
        return {"status": "Failed", "message": "Incomplete manifest or motor pool."}
        
    if pywraplp is None:
        remaining = list(cargo)
        deployed = []
        for veh in sorted(fleet_inventory, key=lambda v: v['gvw_tons'], reverse=True):
            capacity = float(veh['gvw_tons']); loaded=[]; used=0.0
            for item in list(remaining):
                if used + float(item['Weight']) <= capacity:
                    loaded.append(item); used += float(item['Weight']); remaining.remove(item)
            if loaded:
                deployed.append({'vehicle':veh['model_name'],'gvw':veh['gvw_tons'],'cargo':[x['Desc'] for x in loaded]})
            if not remaining: break
        if remaining: return {'status':'Failed','message':'Optimization fallback could not fit the complete manifest.'}
        return {'status':'Success','max_axle_load':max(v['gvw_tons'] for v in fleet_inventory if any(d['vehicle']==v['model_name'] for d in deployed)),'convoy_speed':min(v['max_speed_kmh'] for v in fleet_inventory if any(d['vehicle']==v['model_name'] for d in deployed)),'manifest':deployed,'solver':'greedy-fallback'}

    solver = pywraplp.Solver.CreateSolver('SCIP')
    
    x = {} # item i in vehicle j
    for i in range(len(cargo)):
        for j in range(len(fleet_inventory)):
            x[(i, j)] = solver.IntVar(0, 1, f'x_{i}_{j}')
            
    y = {} # vehicle j deployed
    for j in range(len(fleet_inventory)):
        y[j] = solver.IntVar(0, 1, f'y_{j}')
        
    # Hard Constraint: Load all cargo
    for i in range(len(cargo)):
        solver.Add(sum(x[(i, j)] for j in range(len(fleet_inventory))) == 1)
        
    # Hard Constraint: Vehicle GVW Capacity limits
    for j, veh in enumerate(fleet_inventory):
        solver.Add(sum(cargo[i]['Weight'] * x[(i, j)] for i in range(len(cargo))) <= veh['gvw_tons'] * y[j])
        
    # Dynamic Segregation: Prevent Explosives and Personnel in the same vehicle
    classes = set([item['Class'] for item in cargo])
    if "EXPLOSIVE" in classes and "PERSONNEL" in classes:
        for j in range(len(fleet_inventory)):
            exp_flag = solver.IntVar(0, 1, f'exp_{j}')
            per_flag = solver.IntVar(0, 1, f'per_{j}')
            for i, item in enumerate(cargo):
                if item['Class'] == 'EXPLOSIVE': solver.Add(x[(i, j)] <= exp_flag)
                if item['Class'] == 'PERSONNEL': solver.Add(x[(i, j)] <= per_flag)
            solver.Add(exp_flag + per_flag <= 1)

    # Objective: Minimize deployed vehicles (prioritizing operational cost based on GVW)
    solver.Minimize(sum(veh['gvw_tons'] * y[j] for j, veh in enumerate(fleet_inventory)))
    
    status = solver.Solve()
    
    if status == pywraplp.Solver.OPTIMAL:
        max_axle_load = 0
        min_speed = 999
        deployed_vehicles = []
        
        for j, veh in enumerate(fleet_inventory):
            if y[j].solution_value() > 0.5:
                if veh['gvw_tons'] > max_axle_load: max_axle_load = veh['gvw_tons']
                if veh['max_speed_kmh'] < min_speed: min_speed = veh['max_speed_kmh']
                
                loaded_items = [cargo[i]['Desc'] for i in range(len(cargo)) if x[(i, j)].solution_value() > 0.5]
                deployed_vehicles.append({
                    "vehicle": veh['model_name'],
                    "gvw": veh['gvw_tons'],
                    "cargo": loaded_items
                })
                
        return {
            "status": "Success", 
            "max_axle_load": max_axle_load, 
            "convoy_speed": min_speed,
            "manifest": deployed_vehicles
        }
    else:
        return {"status": "Failed", "message": "Optimization failed. Motor pool lacks capacity."}