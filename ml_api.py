from flask import Flask, request, jsonify
import joblib
import os
import sys
import traceback
import pandas as pd
import numpy as np # Import numpy for handling unseen categories

app = Flask(__name__)

def load_model_and_encoders():
    """Loads the model and label encoders, exiting if files are not found."""
    # Assuming 'models_vect' is in the same directory as your Flask app script
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

# Load the model and encoders when the application starts
loaded_model, loaded_label_encoders = load_model_and_encoders()

# Define the expected features and column types as used during training
# Ensure these match the features used when training the model in your notebook
model_features = ['age', 'weight_kg', 'potential', 'skill_moves', 'work_rate', 'body_type',
                  'pace', 'shooting', 'passing', 'defending', 'physic', 'player_traits']

numerical_cols = ['age', 'weight_kg', 'potential', 'skill_moves', 'pace', 'shooting', 'passing', 'defending', 'physic']
categorical_cols = ['work_rate', 'body_type', 'player_traits']


def preprocess_and_predict(player_data):
    """
    Preprocesses new player data and makes a prediction using the loaded model.

    Args:
        player_data (dict): A dictionary containing the new player's attributes.

    Returns:
        int: The prediction result (0 or 1).
        str: An error message if preprocessing fails.
    """
    try:
        # Create a DataFrame for the new player, ensuring all model_features are present
        # Fill missing required features with a default value (e.g., 0)
        # Ensure the input data keys match model_features keys, fill_value handles missing data points but keys must exist
        new_player_df = pd.DataFrame([player_data]).reindex(columns=model_features, fill_value=0)


        # Preprocess numerical columns
        for col in numerical_cols:
            # Convert to numeric, coerce errors to NaN, then fill NaN with 0
            new_player_df[col] = pd.to_numeric(new_player_df[col], errors='coerce').fillna(0)


        # Preprocess categorical columns using loaded encoders
        for col in categorical_cols:
            if col in loaded_label_encoders:
                le = loaded_label_encoders[col]
                # Fill missing values and ensure string type
                new_player_df[col] = new_player_df[col].fillna('Unknown_Category').astype(str)

                # Handle categories not seen during training gracefully
                # Check for unseen labels and add them to the encoder's classes before transforming
                unseen_labels = new_player_df[col][~new_player_df[col].isin(le.classes_)]
                if not unseen_labels.empty:
                    le.classes_ = np.append(le.classes_, unseen_labels.unique())
                    print(f"Added unseen labels to encoder for '{col}': {unseen_labels.unique()}", file=sys.stderr)


                # Transform the categorical column
                new_player_df[col] = le.transform(new_player_df[col])

            else:
                # Handle case where label encoder is missing for a column (should not happen if vectorizer.pkl is correct)
                print(f"Warning: Label encoder not found for column '{col}'. Filling with 0.", file=sys.stderr)
                new_player_df[col] = 0 # Fallback


        # Ensure the columns are in the same order as the training data features (reindex already did this)
        new_df_processed = new_player_df[model_features]


        # Make prediction using the loaded model
        prediction = loaded_model.predict(new_df_processed)[0]

        # Try to get prediction probabilities if available (useful for debugging)
        proba = None
        try:
            if hasattr(loaded_model, 'predict_proba'):
                proba = loaded_model.predict_proba(new_df_processed)[0].tolist()
        except Exception:
            # non-fatal if model doesn't support predict_proba
            proba = None

        # Calculate a model-informed 'overall_calculated' score using the model's feature importances
        overall_calc = None
        try:
            skill_cols = ['pace', 'shooting', 'passing', 'defending', 'physic', 'potential']
            if hasattr(loaded_model, 'feature_importances_'):
                fi = np.array(loaded_model.feature_importances_)
                # Map feature importances to the skill columns in the same order as model_features
                weights = []
                for col in skill_cols:
                    if col in model_features:
                        idx = model_features.index(col)
                        weights.append(fi[idx])
                    else:
                        weights.append(0.0)
                weights = np.array(weights, dtype=float)
                if weights.sum() > 0:
                    vals = new_df_processed[skill_cols].astype(float).values[0]
                    overall_calc = float(np.dot(vals, weights) / weights.sum())
                    overall_calc = round(overall_calc, 1)
        except Exception:
            overall_calc = None

        # Log processed input (single-row) for debugging
        print(f"Processed input for prediction: {new_df_processed.to_dict(orient='records')[0]}", file=sys.stderr)

        return int(prediction), proba, overall_calc  # Return prediction, probability (or None), and overall_calc

    except Exception as e:
        # Log the full traceback for debugging
        traceback_str = traceback.format_exc()
        print(f"Error during preprocessing or prediction:\n{traceback_str}", file=sys.stderr)
        return None, str(e) # Return no prediction and the error message


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid input: No data provided.'}), 400

        # Use the preprocess_and_predict function
        result = preprocess_and_predict(data)

        # result expected as (prediction, proba, overall_calc) or (None, error_str)
        if not isinstance(result, tuple) or len(result) < 2:
            return jsonify({'error': 'Unexpected result from prediction function.'}), 500

        prediction = result[0]
        proba_or_error = result[1]
        overall_calc = result[2] if len(result) > 2 else None

        # If an error occurred, preprocess_and_predict returns (None, <error str>, None)
        if prediction is None and isinstance(proba_or_error, str):
            return jsonify({'error': f'Preprocessing or prediction failed: {proba_or_error}'}), 500

        proba = proba_or_error if not isinstance(proba_or_error, str) else None

        # Format the response based on prediction (0 or 1)
        response_message = "Player is Eligible to Play" if prediction == 1 else "Player is Not Eligible to Play"
        resp = {'prediction': int(prediction), 'message': response_message}
        if proba is not None:
            resp['probability'] = proba
        if overall_calc is not None:
            resp['overall_calculated'] = overall_calc
        return jsonify(resp)

    except Exception as e:
        # Catch any unexpected errors in the route handler itself
        traceback_str = traceback.format_exc()
        print(f"An unexpected error occurred in /predict route:\n{traceback_str}", file=sys.stderr)
        return jsonify({'error': f'An unexpected error occurred: {e}'}), 500


if __name__ == '__main__':
    # Ensure the models_vect directory exists
    if not os.path.exists('models_vect'):
        os.makedirs('models_vect')
        print("Created 'models_vect' directory. Please place 'model.pkl' and 'vectorizer.pkl' inside.")
        sys.exit(1) # Exit as model files are missing

    # You would typically run this with a production-ready server like Gunicorn
    # app.run(debug=True) # Use debug=True for development
    print("Flask app ready. Use a production WSGI server like Gunicorn to run it.")
    # Example command to run with Gunicorn: gunicorn -w 4 your_app_file_name:app
    app.run(debug=True, host='0.0.0.0', port=5000)
    