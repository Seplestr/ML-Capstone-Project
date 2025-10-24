from flask import Flask, request, jsonify
import joblib
import os
import sys
import traceback
import pandas as pd

app = Flask(__name__)

def load_model_and_encoders():
    """Loads the model and label encoders, exiting if files are not found."""
    model_path = 'models_vect/model.pkl'
    encoders_path = 'models_vect/vectorizer.pkl' # This file contains the dictionary of LabelEncoders

    if not os.path.exists(model_path) or not os.path.exists(encoders_path):
        print("--- FATAL ERROR ---", file=sys.stderr)
        print(f"Could not find model at '{model_path}' or encoders at '{encoders_path}'.", file=sys.stderr)
        print("Please ensure the 'models_vect' directory exists and contains 'model.pkl' and 'vectorizer.pkl'.", file=sys.stderr)
        sys.exit(1) # Exit with an error code

    try:
        model = joblib.load(model_path)
        label_encoders = joblib.load(encoders_path)
        print("--- Model and Label Encoders loaded successfully. ---")
        return model, label_encoders
    except Exception as e:
        print(f"--- FATAL ERROR --- \nFailed to load .pkl files: {e}", file=sys.stderr)
        sys.exit(1)

model, label_encoders = load_model_and_encoders()

# Get the feature names from the model, if available. This helps ensure column order.
try:
    model_feature_names = model.feature_names_in_
except AttributeError:
    model_feature_names = None
    print("Warning: Could not get feature names from model. Ensure column order is correct.")

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid input: No data provided.'}), 400

        # Convert incoming JSON data to a pandas DataFrame
        # The model expects a 2D array, so we create a DataFrame with a single row
        new_data_df = pd.DataFrame([data])

        # --- Get the original feature names before any modifications ---
        if model_feature_names is None:
            return jsonify({'error': "Model is missing 'feature_names_in_'. Cannot process request."}), 500
        original_features = list(model_feature_names)

        # --- Start of Preprocessing ---
        # Replicate the 'work_rate' split from your training notebook
        if 'work_rate' in new_data_df.columns:
            print("Splitting 'work_rate' column.")
            work_rate_split = new_data_df['work_rate'].str.split('/ ', expand=True)
            # Robustly handle cases where the split might not produce two columns
            new_data_df['attacking_work_rate'] = work_rate_split[0].str.strip()
            if work_rate_split.shape[1] > 1:
                new_data_df['defensive_work_rate'] = work_rate_split[1].str.strip()
            else:
                new_data_df['defensive_work_rate'] = work_rate_split[0].str.strip() # Default to the same if only one is provided
            # Explicitly drop the original 'work_rate' column after splitting
            new_data_df = new_data_df.drop(columns=['work_rate'])
        else:
            # If work_rate is not provided, we must add the split columns with a default value (e.g., 'Medium')
            new_data_df['attacking_work_rate'] = 'Medium'
            new_data_df['defensive_work_rate'] = 'Medium'

        # Replicate the 'player_traits' splitting and encoding (assuming multi-label or individual encoding)
        if 'player_traits' in new_data_df.columns:
            print("Processing 'player_traits' column.", file=sys.stderr)
            traits_raw = new_data_df['player_traits'].iloc[0]
            input_traits_list = [trait.strip() for trait in traits_raw.split(',') if trait.strip()]

            # Identify all trait-related columns that the model expects from model_feature_names
            # This assumes trait columns are named like 'trait_Finesse Shot'
            expected_trait_columns = [col for col in original_features if col.startswith('trait_')]

            for expected_col in expected_trait_columns:
                trait_name = expected_col.replace('trait_', '') # Extract original trait name
                if expected_col in label_encoders: # Check if we have an encoder for this specific trait column
                    encoder = label_encoders[expected_col]
                    try:
                        if trait_name in input_traits_list:
                            # If the input trait is present, encode it as 'present' (or 1)
                            new_data_df[expected_col] = encoder.transform(['present'])
                        else:
                            # If the input trait is absent, encode it as 'absent' (or 0)
                            new_data_df[expected_col] = encoder.transform(['absent'])
                    except ValueError as ve:
                        # This means 'present' or 'absent' is an unseen label for this specific trait encoder
                        error_detail = f"Configuration Error: Unseen label ('present' or 'absent') for trait '{trait_name}' in column '{expected_col}': {ve}. Please check encoder setup in your notebook."
                        print(f"--- Prediction Error ---\n{error_detail}", file=sys.stderr)
                        return jsonify({'error': error_detail}), 400
                else:
                    # If there's no encoder for an expected trait column, it's a configuration issue
                    print(f"Warning: No LabelEncoder found for expected trait column '{expected_col}'. Setting to 0 (absent).", file=sys.stderr)
                    new_data_df[expected_col] = 0 # Default to absent if no encoder is found


        # Preprocess the categorical columns using the loaded label encoders
        for column in label_encoders:
            if column in new_data_df.columns:
                # Access the specific encoder for the column
                encoder = label_encoders[column]
                try:
                    new_data_df[column] = encoder.transform(new_data_df[column])
                except ValueError as ve:
                    # Handle unseen labels more gracefully
                    error_detail = f"Unseen label(s) in column '{column}': {ve}. Please ensure input matches training data categories."
                    print(f"--- Prediction Error ---\n{error_detail}", file=sys.stderr)
                    return jsonify({'error': error_detail}), 400
            else:
                print(f"Warning: Column '{column}' not found in input data, skipping encoding.")
        
        # --- End of Preprocessing ---

        # Reorder DataFrame columns to match the order the model was trained on
        try:
            print("Reordering columns to match model training order.", file=sys.stderr)
            new_data_df = new_data_df[original_features]
        except KeyError as e:
            missing_cols = set(original_features) - set(new_data_df.columns)
            error_detail = f"DataFrame is missing required columns after preprocessing: {list(missing_cols)}. Original error: {e}"
            return jsonify({'error': error_detail}), 500

        prediction = model.predict(new_data_df)

        # Convert the NumPy data type to a native Python type for JSON serialization
        output = prediction[0]

        # Use .item() for single numeric values, otherwise convert to a standard string
        if hasattr(output, 'item'):
            bot_response = output.item()
        else:
            bot_response = str(output)

        return jsonify({'response': bot_response})
    except Exception as e:
        print(f"--- An unexpected error occurred during prediction ---", file=sys.stderr)
        print(f"Type of error: {type(e)}", file=sys.stderr)
        print(f"Error object: {repr(e)}", file=sys.stderr)
        print(f"Error message (str(e)): {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr) # Print full traceback to stderr
        print("-----------------------------------------------------", file=sys.stderr)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)