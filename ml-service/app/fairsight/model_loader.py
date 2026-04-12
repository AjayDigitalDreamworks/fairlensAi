import joblib

def load_sklearn_model(path):
    """Loads sklearn models (.pkl or .joblib)"""
    return joblib.load(path)

def load_keras_model(path):
    """Loads keras models (.h5)"""
    from tensorflow.keras.models import load_model
    return load_model(path)

def load_transformers(scaler_path, encoder_path=None):
    """Always load matching scaler and label encoder to avoid fitting on test sets."""
    scaler = joblib.load(scaler_path)
    encoder = joblib.load(encoder_path) if encoder_path else None
    return scaler, encoder

def load_model_auto(path: str):
    """Automatically loads either sklearn (.pkl/.joblib) or keras (.h5) depending on extension."""
    if path.endswith('.h5') or path.endswith('.keras'):
        return load_keras_model(path)
    else:
        return load_sklearn_model(path)
